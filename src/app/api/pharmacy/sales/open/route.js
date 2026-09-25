import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { normalizeIndianPhone } from "@/lib/phone";
import { billInfo } from "@/lib/labBills";

export const dynamic = "force-dynamic";

// "This customer wants to run a tab" (CLAUDE.md pharmacy spec §9, Running / Combined Bill): find a
// still-open counter sale for a phone number, so the counter screen can offer "add to this bill"
// instead of always starting a fresh one. Scoped to `visit_id IS NULL` — a walk-in sale's own bill
// shape — so this never surfaces or merges into an OPD checkout bill from the Billing module.
export const GET = apiRoute("pharmacy:sell", async (request) => {
  const url = new URL(request.url);
  const rawPhone = (url.searchParams.get("phone") || "").trim();
  if (!rawPhone) return json({ bills: [] });
  const phone = normalizeIndianPhone(rawPhone) || rawPhone;

  const bills = await tenantDb.bills.findMany({
    where: { visit_id: null, bill_type: "OPD", finalized_at: null, status: { in: ["OPEN", "PARTIALLY_PAID"] }, patients: { phone } },
    include: { patients: { select: { name: true, phone: true } }, bill_items: { select: { id: true } } },
    orderBy: { created_at: "desc" },
    take: 5,
  });
  const info = await billInfo(bills.map((b) => b.id));
  return json({
    bills: bills.map((b) => ({
      id: Number(b.id),
      patientId: Number(b.patient_id),
      customerName: b.patients.name,
      itemCount: b.bill_items.length,
      createdAt: b.created_at,
      ...(info.get(String(b.id)) || { total: 0, due: 0, status: b.status }),
    })),
  });
});
