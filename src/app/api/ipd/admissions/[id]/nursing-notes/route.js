import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  note: z.string().trim().max(4000).optional().default(""),
  vitals: z
    .object({
      bp: z.string().trim().max(20).optional(),
      pulse: z.coerce.number().min(0).max(300).optional(),
      temp: z.coerce.number().min(80).max(115).optional(),
      spo2: z.coerce.number().min(0).max(100).optional(),
    })
    .partial()
    .optional(),
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
  const created = await tenantDb.nursing_notes.create({
    data: {
      admission_id: admissionId,
      author_user_id: BigInt(ctx.session.userId),
      note: body.note || null,
      vitals: body.vitals && Object.keys(body.vitals).length ? JSON.stringify(body.vitals) : null,
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
