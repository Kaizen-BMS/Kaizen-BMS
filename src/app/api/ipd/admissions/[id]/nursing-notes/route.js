import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Vitals are a per-tenant configurable field set (see CLAUDE.md
// "vital_parameters") — no fixed bp/pulse/temp/spo2 shape anymore. A plain
// key->string record is accepted here and re-validated below against the
// tenant's own ACTIVE parameter list, never trusted bare (same discipline
// as the custom-fields pattern the rest of this project already uses).
const createSchema = z.object({
  note: z.string().trim().max(4000).optional().default(""),
  vitals: z.record(z.string().max(40), z.string().trim().max(30)).optional(),
});

export const POST = apiRoute("nursingnote:create", async (request, ctx) => {
  const { id } = await ctx.params;
  const admissionId = BigInt(id);
  const admission = await tenantDb.admissions.findUnique({
    where: { id: admissionId },
    select: { id: true, discharged_at: true },
  });
  if (!admission) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, createSchema);

  const params = await tenantDb.vital_parameters.findMany({ where: { active: true } });
  const byKey = new Map(params.map((p) => [p.field_key, p]));
  const vitals = {};
  for (const [key, value] of Object.entries(body.vitals || {})) {
    const param = byKey.get(key);
    if (!param || !value) continue;
    if (param.value_type === "NUMBER" && !/^-?\d+(\.\d+)?$/.test(value)) continue;
    if (param.value_type === "BP" && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(value)) continue;
    vitals[key] = value;
  }

  const created = await tenantDb.nursing_notes.create({
    data: {
      admission_id: admissionId,
      author_user_id: BigInt(ctx.session.userId),
      note: body.note || null,
      vitals: Object.keys(vitals).length ? JSON.stringify(vitals) : null,
    },
  });

  const withAuthor = await tenantDb.nursing_notes.findUnique({
    where: { id: created.id },
    include: { users: { select: { name: true } } },
  });
  const { users: u, ...rest } = withAuthor;
  const note = { ...rest, author_name: u.name };

  emitToModule(ctx.session.tenantId, "IPD", "nursingnote:created", { admissionId: Number(admissionId), note });
  return json({ note }, 201);
});
