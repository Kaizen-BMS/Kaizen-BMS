import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  start: z.string().trim().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().trim().regex(/^\d{2}:\d{2}$/).optional(),
  active: z.coerce.boolean().optional(),
});

export const PATCH = apiRoute("staff:manage", async (request, { params }) => {
  const { id } = await params;
  const existing = await tenantDb.shift_templates.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return json({ error: "not_found" }, 404);
  const b = await parseBody(request, schema);
  await tenantDb.shift_templates.update({
    where: { id: existing.id },
    data: {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.start ? { start_time: new Date(`1970-01-01T${b.start}:00.000Z`) } : {}),
      ...(b.end ? { end_time: new Date(`1970-01-01T${b.end}:00.000Z`) } : {}),
      ...(b.active !== undefined ? { active: b.active } : {}),
    },
  });
  return json({ ok: true });
});
