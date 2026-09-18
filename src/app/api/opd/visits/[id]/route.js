import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { serializeOrder } from "@/lib/radiology";

export const dynamic = "force-dynamic";

// Everything the consultation screen needs for one visit.
export const GET = apiRoute("consultation:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const visitId = BigInt(id);

  const visitRow = await tenantDb.visits.findUnique({
    where: { id: visitId },
    include: {
      patients: {
        select: { name: true, age: true, phone: true, custom_fields: true, allergies: true, abha_id: true },
      },
    },
  });
  if (!visitRow) return json({ error: "not_found" }, 404);
  const { patients: p, ...visitRest } = visitRow;
  const visit = {
    ...visitRest,
    patient_name: p.name,
    patient_age: p.age,
    patient_phone: p.phone,
    patient_custom_fields: p.custom_fields,
    patient_allergies: p.allergies,
    patient_abha_id: p.abha_id,
  };

  const consultation = await tenantDb.consultations.findFirst({
    where: { visit_id: visitId },
    orderBy: { id: "desc" },
  });

  let prescriptions = [];
  let labOrders = [];
  let radiologyOrders = [];
  if (consultation) {
    const rxRows = await tenantDb.prescriptions.findMany({
      where: { consultation_id: consultation.id },
      orderBy: { id: "asc" },
      include: { prescription_items: { orderBy: { id: "asc" } } },
    });
    prescriptions = rxRows.map(({ prescription_items, ...rest }) => ({
      ...rest,
      items: prescription_items,
    }));
    labOrders = await tenantDb.lab_orders.findMany({
      where: { consultation_id: consultation.id },
      orderBy: { id: "asc" },
    });
    radiologyOrders = (
      await tenantDb.radiology_orders.findMany({
        where: { consultation_id: consultation.id },
        orderBy: { id: "asc" },
      })
    ).map(serializeOrder);
  }

  return json({ visit, consultation, prescriptions, labOrders, radiologyOrders });
});
