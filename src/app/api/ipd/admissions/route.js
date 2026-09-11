import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToTenant, emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Admit onto a specific (vacant) bed. Accepts an existing open visit, an
// existing patient (a fresh Direct Admission visit is opened for them), or
// a brand-new patient's details — whichever the bed-board's admit flow was
// started from.
const createSchema = z
  .object({
    bedId: z.coerce.number().int().positive(),
    reason: z.string().trim().max(500).optional().default(""),
    visitId: z.coerce.number().int().positive().optional(),
    patientId: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).max(191).optional(),
    age: z.coerce.number().int().min(0).max(150).optional(),
    phone: z.string().trim().min(3).max(32).optional(),
  })
  .refine((b) => b.visitId || b.patientId || (b.name && b.phone), {
    message: "provide visitId, patientId, or a new patient's name + phone",
  });

export const POST = apiRoute("admission:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const hid = requireTenantId();

  const bed = await tenantDb.beds.findUnique({ where: { id: BigInt(body.bedId) } });
  if (!bed) return json({ error: "bed_not_found" }, 404);
  if (bed.status !== "VACANT") throw new HttpError(409, "bed_not_vacant");

  const admissionId = await tenantDb.$transaction(async (tx) => {
    let visitId = body.visitId ? BigInt(body.visitId) : null;

    if (!visitId) {
      let patientId = body.patientId ? BigInt(body.patientId) : null;
      if (!patientId) {
        const p = await tx.patients.create({
          data: { name: body.name, age: body.age ?? null, phone: body.phone },
        });
        patientId = p.id;
      }
      const v = await tx.visits.create({
        data: {
          patient_id: patientId,
          entry_type: "DIRECT_ADMISSION",
          status: "ADMITTED",
          reason: body.reason || null,
          registered_by: BigInt(session.userId),
        },
      });
      visitId = v.id;
    } else {
      await tx.visits.update({ where: { id: visitId }, data: { status: "ADMITTED" } });
    }

    const admission = await tx.admissions.create({
      data: {
        visit_id: visitId,
        bed_id: BigInt(body.bedId),
        admitted_by: BigInt(session.userId),
      },
    });
    await tx.beds.update({ where: { id: BigInt(body.bedId) }, data: { status: "OCCUPIED" } });
    return admission.id;
  });

  const withJoins = await tenantDb.admissions.findUnique({
    where: { id: admissionId },
    include: { visits: { include: { patients: { select: { name: true, age: true } } } } },
  });
  const { visits: v, ...rest } = withJoins;
  const { patients: p, ...vRest } = v;
  const admission = { ...rest, patient_id: vRest.patient_id, patient_name: p.name, patient_age: p.age };

  const bedNow = await tenantDb.beds.findUnique({ where: { id: BigInt(body.bedId) } });

  emitToModule(session.tenantId, "IPD", "admission:created", { admission });
  emitToModule(session.tenantId, "IPD", "bed:updated", { bed: bedNow });
  emitToTenant(session.tenantId, "visit:updated", {
    visit: { id: Number(admission.visit_id), status: "ADMITTED" },
  });

  return json({ admission }, 201);
});
