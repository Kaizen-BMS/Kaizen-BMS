import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { requireTenantId } from "@/lib/requestContext";
import { prisma } from "@/lib/prismaClient";
import { getPartnerSalesReport } from "@/lib/pharmacyReports";
import { sendPartnerSalesReportEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const schema = z.object({
  connectionId: z.coerce.number().int().positive(),
  date: z.string().trim().optional(),
});

// Email one connection's daily sales, from this (fulfilling) pharmacy to the
// connected hospital's own owner/admin — the only "contact" this project has
// for a partner tenant (see CLAUDE.md "Super Admin" — the owner account
// created at tenant provisioning). Real send, reusing the same Gmail SMTP
// transport already wired for patient OTP — no fabricated delivery.
export const POST = apiRoute("pharmacy:reports", async (request) => {
  const body = await parseBody(request, schema);
  const tenantId = BigInt(requireTenantId());

  const conn = await prisma.org_connections.findUnique({ where: { id: BigInt(body.connectionId) } });
  if (!conn || Number(conn.receiver_tenant_id) !== Number(tenantId)) throw new HttpError(404, "connection_not_found");
  if (conn.service_type !== "PHARMACY") throw new HttpError(409, "not_a_pharmacy_connection");

  const [thisTenant, partnerTenant] = await Promise.all([
    prisma.tenants.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.tenants.findUnique({ where: { id: conn.requester_tenant_id }, select: { name: true } }),
  ]);
  const owner = await prisma.users.findFirst({
    where: { tenant_id: conn.requester_tenant_id, role: { in: ["HOSPITAL_ADMIN", "OWNER_DOCTOR", "OWNER_PHARMACIST", "OWNER_LAB_TECH"] } },
    orderBy: { id: "asc" },
    select: { email: true },
  });
  if (!owner?.email) throw new HttpError(409, "partner_has_no_contact_email");

  const report = await getPartnerSalesReport(tenantId, { date: body.date });
  const group = report.connections.find((g) => g.connectionId === Number(conn.id));

  try {
    await sendPartnerSalesReportEmail(owner.email, {
      fromTenantName: thisTenant?.name || "Pharmacy",
      toTenantName: partnerTenant?.name || "Partner",
      date: report.date,
      items: group?.items || [],
      totalQuantity: group?.totalQuantity || 0,
      totalAmount: group?.totalAmount || 0,
    });
  } catch (err) {
    // Same "never let an infra failure look like anything else" discipline
    // as the patient-OTP mailer — log server-side only, surface a clean code.
    console.error("[partner-sales-share] send failed", err.message);
    throw new HttpError(502, "email_send_failed");
  }

  return json({ ok: true, sentTo: owner.email });
});
