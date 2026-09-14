import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// Staff/admin view of patient feedback for this tenant — data capture +
// visibility only for this pass, feeding a future Reports & Analytics
// dashboard rather than building a bespoke one here.
export const GET = apiRoute("feedback:read", async () => {
  const rows = await tenantDb.feedback.findMany({
    include: { patients: { select: { name: true } }, visits: { select: { entry_type: true } } },
    orderBy: { created_at: "desc" },
  });

  const feedback = rows.map((f) => ({
    id: Number(f.id),
    rating: f.rating,
    comment: f.comment,
    createdAt: f.created_at,
    patientName: f.patients.name,
    entryType: f.visits.entry_type,
  }));
  return json({ feedback });
});
