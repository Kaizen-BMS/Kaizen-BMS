import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { findById, insert, scopedQueryOne } from "@/lib/repo/tenant";
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
  const admissionId = Number(id);
  const admission = await findById("admissions", admissionId, "id, discharged_at");
  if (!admission) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, createSchema);
  const noteId = await insert("nursing_notes", {
    admission_id: admissionId,
    author_user_id: ctx.session.userId,
    note: body.note || null,
    vitals: body.vitals && Object.keys(body.vitals).length ? JSON.stringify(body.vitals) : null,
  });

  const note = await scopedQueryOne(
    `SELECT n.*, u.name AS author_name FROM nursing_notes n
       JOIN users u ON u.id = n.author_user_id
      WHERE n.tenant_id = :tid AND n.id = :id`,
    { id: noteId },
  );

  emitToModule(ctx.session.tenantId, "IPD", "nursingnote:created", { admissionId, note });
  return json({ note }, 201);
});
