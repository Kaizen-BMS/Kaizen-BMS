import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";
import { resolvePatientIdFilter } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

// Status + balance only — no online payment (needs a real payment gateway,
// a business decision, not something to wire up silently as part of this
// UI work; see CLAUDE.md). Every bill shows "Pay at hospital" until that's
// decided.
export const GET = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "BILLING");
  if (!active) return json({ moduleActive: false, bills: [] });

  const url = new URL(request.url);
  const filter = await resolvePatientIdFilter(session, url.searchParams.get("patientId"));
  if (filter.error) return json({ error: filter.error }, 403);

  const rows = await tenantDb.bills.findMany({
    where: { patient_id: { in: filter.ids } },
    include: { bill_items: true, payments: true, discounts: true, refunds: true },
    orderBy: { created_at: "desc" },
  });

  const bills = rows.map((b) => {
    const itemsTotal = b.bill_items.reduce((s, i) => s + Number(i.amount), 0);
    const discountTotal = b.discounts.reduce((s, d) => s + Number(d.amount), 0);
    const paidTotal = b.payments.reduce((s, p) => s + Number(p.amount), 0);
    const refundTotal = b.refunds.reduce((s, r) => s + Number(r.amount), 0);
    const netDue = Math.max(itemsTotal - discountTotal, 0);
    const balance = Math.max(netDue - (paidTotal - refundTotal), 0);
    return {
      id: Number(b.id),
      billType: b.bill_type,
      status: b.status,
      createdAt: b.created_at,
      netAmount: netDue,
      balanceDue: balance,
      payAtHospital: balance > 0,
    };
  });
  return json({ moduleActive: true, bills });
});
