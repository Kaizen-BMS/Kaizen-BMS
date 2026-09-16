import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getDoctorRevenue } from "@/lib/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

// REPORT 7 — Doctor / Service Revenue. Only bill items with a direct FK
// chain to a doctor (via a consultation) are ever attributed — see
// src/lib/reports.js's getDoctorRevenue() for why lab/pharmacy lines are
// deliberately excluded rather than guessed.
export const GET = apiRoute("reports:view", async (request) => {
  const { searchParams } = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(searchParams));
  try {
    const rows = await getDoctorRevenue(BigInt(requireTenantId()), q);
    return json({ rows });
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }
});
