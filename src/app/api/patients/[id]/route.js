import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// One patient's profile page data (tenant-scoped).
export const GET = apiRoute("patient:read", async (request, { params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "patient_not_found");
  const pid = BigInt(id);
  const p = await tenantDb.patients.findUnique({ where: { id: pid } });
  if (!p) throw new HttpError(404, "patient_not_found");

  const [insurance, visits] = await Promise.all([
    tenantDb.patient_insurance.findUnique({ where: { patient_id: pid }, select: { payment_category: true, insurance_available: true, insurance_company: true } }).catch(() => null),
    tenantDb.visits.findMany({ where: { patient_id: pid }, orderBy: { id: "desc" }, take: 1, select: { id: true, token_number: true, status: true, created_at: true } }),
  ]);
  let allergies = [];
  try {
    allergies = p.allergies ? JSON.parse(p.allergies) : [];
  } catch {
    /* ignore */
  }
  return json({
    patient: {
      id: Number(p.id),
      name: p.name,
      age: p.age,
      gender: p.gender,
      phone: p.phone,
      email: p.email,
      abhaId: p.abha_id,
      allergies,
      registeredAt: p.created_at,
      paymentCategory: insurance?.payment_category || "SELF_PAY",
      insurance: insurance?.insurance_available ? insurance.insurance_company || "Insured" : null,
    },
    latestVisit: visits[0] ? { id: Number(visits[0].id), token: visits[0].token_number, status: visits[0].status, at: visits[0].created_at } : null,
  });
});
