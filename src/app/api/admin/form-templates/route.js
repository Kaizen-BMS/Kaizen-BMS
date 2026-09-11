import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { query } from "@/lib/db";
import { requireTenantId } from "@/lib/repo/tenant";
import {
  FORM_TYPES,
  templateFieldsSchema,
  resolveForm,
  CORE_FIELDS,
} from "@/lib/forms";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// All four resolved forms for this hospital — for the form-builder screen.
export const GET = apiRoute("formtemplate:manage", async (request, ctx) => {
  const forms = {};
  for (const ft of FORM_TYPES) {
    forms[ft] = await resolveForm(ctx.session.tenantId, ft);
  }
  return json({ forms });
});

const putSchema = z.object({
  formType: z.enum(FORM_TYPES),
  // Only the owner-added fields; core fields are code-defined and rejected here.
  fields: templateFieldsSchema,
});

export const PUT = apiRoute("formtemplate:manage", async (request, ctx) => {
  const body = await parseBody(request, putSchema);

  const coreNames = new Set(
    (CORE_FIELDS[body.formType] || []).map((f) => f.fieldName),
  );
  const seen = new Set();
  for (const f of body.fields) {
    if (coreNames.has(f.fieldName)) {
      return json({ error: `"${f.fieldName}" is a core field` }, 400);
    }
    if (seen.has(f.fieldName)) {
      return json({ error: `duplicate field "${f.fieldName}"` }, 400);
    }
    seen.add(f.fieldName);
  }

  const hid = requireTenantId();
  await query(
    `INSERT INTO form_templates (tenant_id, form_type, fields)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE fields = VALUES(fields)`,
    [hid, body.formType, JSON.stringify(body.fields)],
  );

  const form = await resolveForm(ctx.session.tenantId, body.formType);
  emitToTenant(ctx.session.tenantId, "formtemplate:updated", { form });
  return json({ form });
});
