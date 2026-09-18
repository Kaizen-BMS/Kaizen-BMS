import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { sendPrescriptionItemExternal } from "@/lib/externalPharmacy";

export const dynamic = "force-dynamic";

// Prescription -> internal-or-external pharmacy selection (this task's "C"
// — External Pharmacy Integration). Internal FEFO dispensing
// (POST /api/pharmacy/dispense/[itemId]) is completely untouched — this is
// the alternate path one prescription line can take. Gated the same as
// prescribing itself (prescription:create, DOCTOR_OPD) since choosing an
// external pharmacy for a line is a clinical/ordering decision, not a
// pharmacy-counter one.
const bodySchema = z.object({
  providerId: z.coerce.number().int().positive().optional(),
});

export const POST = apiRoute("prescription:create", async (request, { session, params }) => {
  const { itemId } = await params;
  const body = await parseBody(request, bodySchema);
  const result = await sendPrescriptionItemExternal({ prescriptionItemId: itemId, providerId: body.providerId, actorUserId: session.userId });
  return json({
    externalOrder: {
      id: Number(result.externalOrder.id),
      status: result.externalOrder.status,
      externalOrderRef: result.externalOrder.external_order_ref,
    },
    alreadySent: result.alreadySent,
  });
});
