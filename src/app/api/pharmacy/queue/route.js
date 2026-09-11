import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// Prescriptions still needing (full or partial) dispensing, oldest first.
export const GET = apiRoute("prescription:read", async () => {
  const rows = await tenantDb.prescriptions.findMany({
    where: { status: { in: ["PENDING", "PARTIALLY_FULFILLED"] }, visit_id: { not: null } },
    orderBy: { created_at: "asc" },
    include: {
      visits: { include: { patients: { select: { id: true, name: true, allergies: true } } } },
      prescription_items: { orderBy: { id: "asc" } },
    },
  });

  const prescriptions = rows.map(({ visits: v, prescription_items, ...rest }) => ({
    ...rest,
    patient_id: v.patients.id,
    patient_name: v.patients.name,
    patient_allergies: v.patients.allergies,
    items: prescription_items,
  }));

  return json({ prescriptions });
});
