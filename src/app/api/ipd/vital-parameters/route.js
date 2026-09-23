import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Nursing-note vitals are a per-tenant configurable list, not a fixed
// BP/Pulse/Temp/SpO2 set — see CLAUDE.md "vital_parameters". range_config
// drives auto in-range/out-of-range flagging on the IPD nursing-note screen
// instead of a nurse manually picking Normal/High/Low.
export const GET = apiRoute("vitalparam:read", async (request) => {
  const includeInactive = new URL(request.url).searchParams.get("all") === "1";
  const vitalParameters = await tenantDb.vital_parameters.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ display_order: "asc" }, { id: "asc" }],
  });
  return json({
    vitalParameters: vitalParameters.map((v) => ({
      ...v,
      range_config: v.range_config ? JSON.parse(v.range_config) : null,
    })),
  });
});

const numberRange = z
  .object({ min: z.coerce.number(), max: z.coerce.number() })
  .refine((r) => r.min <= r.max, { message: "min must be <= max" });

const createSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    unit: z.string().trim().max(30).optional().or(z.literal("")),
    valueType: z.enum(["NUMBER", "BP", "TEXT"]),
    range: z.union([numberRange, z.object({ systolic: numberRange, diastolic: numberRange }), z.null()]).optional(),
  })
  .refine((b) => (b.valueType === "BP" ? !!b.range && "systolic" in b.range : true), {
    message: "BP needs a systolic/diastolic range",
    path: ["range"],
  })
  .refine((b) => (b.valueType === "NUMBER" ? !b.range || "min" in b.range : true), {
    message: "invalid range for a NUMBER parameter",
    path: ["range"],
  });

function slugify(label) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "vital"
  );
}

export const POST = apiRoute("vitalparam:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);

  const existingKeys = new Set(
    (await tenantDb.vital_parameters.findMany({ select: { field_key: true } })).map((v) => v.field_key)
  );
  const base = slugify(body.label);
  let fieldKey = base;
  let n = 2;
  while (existingKeys.has(fieldKey)) fieldKey = `${base}_${n++}`;

  const maxOrder = await tenantDb.vital_parameters.aggregate({ _max: { display_order: true } });

  const vitalParameter = await tenantDb.vital_parameters.create({
    data: {
      field_key: fieldKey,
      label: body.label,
      unit: body.unit || null,
      value_type: body.valueType,
      range_config: body.valueType === "TEXT" ? null : JSON.stringify(body.range || null),
      display_order: (maxOrder._max.display_order || 0) + 1,
    },
  });
  const shaped = { ...vitalParameter, range_config: vitalParameter.range_config ? JSON.parse(vitalParameter.range_config) : null };
  emitToTenant(session.tenantId, "vitalparam:updated", { vitalParameter: shaped });
  return json({ vitalParameter: shaped }, 201);
});
