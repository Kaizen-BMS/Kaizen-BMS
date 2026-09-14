import { z } from "zod";
import { patientApiRoute, json, HttpError } from "@/lib/patientApiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { ownsPatient } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

// `patientId` is required, same reasoning as booking — a session can cover
// several family profiles, so feedback must say which one it's from, never
// assume a 1:1 session-to-patient mapping.
const createSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  visitId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().default(""),
});

export const POST = patientApiRoute(async (request, { session }) => {
  const body = await parseBody(request, createSchema);

  const patientId = await ownsPatient(session.phone, body.patientId);
  if (!patientId) throw new HttpError(403, "not_your_profile");

  // Never trust visitId alone — it must belong to THIS patient, and the
  // visit must actually be completed (once-per-completed-visit, per spec).
  const visitId = BigInt(body.visitId);
  const visit = await tenantDb.visits.findUnique({
    where: { id: visitId },
    select: { id: true, patient_id: true, status: true },
  });
  if (!visit || visit.patient_id !== patientId) throw new HttpError(404, "visit_not_found");
  if (visit.status !== "DISCHARGED") throw new HttpError(409, "visit_not_completed");

  try {
    const feedback = await tenantDb.feedback.create({
      data: { visit_id: visitId, patient_id: patientId, rating: body.rating, comment: body.comment || null },
    });
    return json({ feedback }, 201);
  } catch (err) {
    // uq_feedback_visit — once per visit, enforced at the DB level too.
    if (err?.code === "P2002") throw new HttpError(409, "already_submitted");
    throw err;
  }
});
