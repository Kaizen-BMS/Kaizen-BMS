"use strict";

const { z } = require("zod");
const { queryOne } = require("./db");
const { HttpError } = require("./apiRoute");

/**
 * Customizable forms — template + flexible-storage.
 *
 * Core fields are code-defined and non-removable; they map to real typed
 * columns on the entity. Owner-added fields live in `form_templates.fields`
 * (JSON) and their submitted values go into the entity's `custom_fields`
 * JSON column. A hospital owner adding a field is a data change, never a
 * migration — see CLAUDE.md "Customizable forms".
 */

const FORM_TYPES = [
  "PATIENT_REGISTRATION",
  "CONSULTATION",
  "LAB_ORDER",
  "BILLING",
];

const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
  "phone",
];

// fieldName here = the real column it maps to. `core: true` => the
// form-builder UI must render it read-only / non-removable.
const CORE_FIELDS = {
  PATIENT_REGISTRATION: [
    { fieldName: "name", label: "Full name", type: "text", required: true, core: true, order: 0 },
    { fieldName: "age", label: "Age", type: "number", required: true, core: true, order: 1 },
    {
      fieldName: "gender",
      label: "Gender",
      type: "select",
      required: false,
      core: true,
      order: 2,
      options: ["MALE", "FEMALE", "OTHER"],
    },
    { fieldName: "phone", label: "Phone", type: "phone", required: true, core: true, order: 3 },
    { fieldName: "reason", label: "Reason for visit", type: "textarea", required: false, core: true, order: 4 },
  ],
  CONSULTATION: [
    { fieldName: "notes", label: "Clinical notes", type: "textarea", required: false, core: true, order: 0 },
    { fieldName: "diagnosis", label: "Diagnosis", type: "text", required: false, core: true, order: 1 },
    { fieldName: "fee", label: "Consultation fee", type: "number", required: true, core: true, order: 2 },
  ],
  LAB_ORDER: [
    { fieldName: "tests", label: "Tests requested", type: "textarea", required: true, core: true, order: 0 },
  ],
  BILLING: [],
};

/** Zod schema an owner-defined field descriptor must satisfy. */
const fieldDescriptorSchema = z
  .object({
    fieldName: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "lowercase letters, digits, underscore"),
    label: z.string().trim().min(1).max(120),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    order: z.number().int().min(0).max(999).default(0),
    options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .refine((f) => f.type !== "select" || (f.options && f.options.length > 0), {
    message: "select fields need at least one option",
  });

const templateFieldsSchema = z.array(fieldDescriptorSchema).max(60);

/**
 * The full field list to render for a form: code core fields first, then the
 * hospital's owner-added fields (validated + sorted). `custom_fields` values
 * are keyed by the extra fields' fieldName.
 */
async function resolveForm(tenantId, formType) {
  if (!FORM_TYPES.includes(formType)) {
    throw new Error(`unknown form type: ${formType}`);
  }
  const core = CORE_FIELDS[formType] || [];
  const coreNames = new Set(core.map((f) => f.fieldName));

  let extra = [];
  if (tenantId != null) {
    const row = await queryOne(
      "SELECT fields FROM form_templates WHERE tenant_id = ? AND form_type = ? LIMIT 1",
      [tenantId, formType],
    );
    if (row?.fields) {
      const raw = typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields;
      const parsed = templateFieldsSchema.safeParse(raw);
      if (parsed.success) {
        extra = parsed.data
          .filter((f) => !coreNames.has(f.fieldName)) // core always wins
          .sort((a, b) => a.order - b.order);
      }
    }
  }
  return { formType, core, extra };
}

/** One owner-added field → its value zod schema. */
function fieldValueSchema(f) {
  let s;
  switch (f.type) {
    case "number":
      s = z.coerce.number();
      break;
    case "checkbox":
      s = z.coerce.boolean();
      break;
    case "date":
      s = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
      break;
    case "select":
      s = z.enum(f.options && f.options.length ? f.options : ["__none__"]);
      break;
    default:
      s = z.string().trim().max(2000);
  }
  return f.required ? s : s.optional().nullable();
}

/**
 * Validate the dynamic part of a submission against the hospital's *current*
 * template. Returns the cleaned custom_fields object (only keys the template
 * defines) or throws a zod error. Core fields are validated separately by
 * each route's own schema.
 */
async function validateCustomFields(tenantId, formType, input) {
  const { extra } = await resolveForm(tenantId, formType);
  if (extra.length === 0) return null;

  const shape = {};
  for (const f of extra) shape[f.fieldName] = fieldValueSchema(f);
  const schema = z.object(shape).strip();

  const parsed = schema.safeParse(input || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      issue
        ? `customFields.${issue.path.join(".")}: ${issue.message}`
        : "invalid custom fields",
    );
  }
  // Drop undefined so we store a tidy object.
  const out = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

module.exports = {
  FORM_TYPES,
  FIELD_TYPES,
  CORE_FIELDS,
  templateFieldsSchema,
  resolveForm,
  validateCustomFields,
};
