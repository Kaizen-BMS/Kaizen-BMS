import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { sendDirect } from "@/lib/partners";
import { requirePartnerWork } from "@/lib/partnerAccess";

export const dynamic = "force-dynamic";

const schema = z.object({
  connectionId: z.coerce.number().int().positive(),
  medicineName: z.string().trim().max(191).optional(),
  quantity: z.coerce.number().int().min(1).max(100000).optional(),
  dosage: z.string().trim().max(191).optional(),
  testName: z.string().trim().max(191).optional(),
  patientName: z.string().trim().max(191).optional(),
  patientAge: z.coerce.number().int().min(0).max(150).optional(),
  priority: z.enum(["ROUTINE", "URGENT"]).optional(),
  patientGender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  patientPhone: z.string().trim().max(32).optional(),
  reason: z.string().trim().max(300).optional(),
  summary: z.string().trim().max(1000).optional(),
});

// A facility's own request to a connected partner (medicine request, test referral …).
export const POST = apiRoute(null, async (request, { session }) => {
  requirePartnerWork(session);
  const body = await parseBody(request, schema);
  return json(await sendDirect(session, body.connectionId, body), 201);
});
