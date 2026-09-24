import { NextResponse } from "next/server";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

/**
 * PUBLIC, unauthenticated — the waiting-room TV has no login (see
 * proxy.js PUBLIC_API_PREFIXES and src/lib/allergyCheck.js-style scoping
 * notes). Deliberately returns token numbers only, never patient names or
 * any other clinical data. Not wrapped in apiRoute() on purpose: there is no
 * session to check module gating against — anyone with the tenant's slug can
 * read this, exactly like the physical waiting-room screen itself.
 */
export async function GET(_request, ctx) {
  const { tenantSlug } = await ctx.params;

  const tenant = await prisma.tenants.findFirst({
    where: { slug: tenantSlug, active: true },
    select: { id: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const servingRows = await prisma.$queryRawUnsafe(
    `SELECT token_number FROM visits
      WHERE tenant_id = ? AND DATE(created_at) = CURDATE() AND status = 'WITH_DOCTOR'
      ORDER BY updated_at DESC LIMIT 1`,
    tenant.id,
  );
  const waitingRows = await prisma.$queryRawUnsafe(
    `SELECT token_number FROM visits
      WHERE tenant_id = ? AND DATE(created_at) = CURDATE()
        AND status IN ('REGISTERED', 'TRIAGE') AND token_number IS NOT NULL
      ORDER BY token_number ASC LIMIT 10`,
    tenant.id,
  );

  // Tokens run per doctor, so a hospital with several doctors shows one counter each
  // (doctor name + token numbers only — no patient details).
  const rows = await prisma.$queryRawUnsafe(
    `SELECT v.doctor_id, u.name AS doctor_name, v.token_number, v.status
       FROM visits v LEFT JOIN users u ON u.id = v.doctor_id
      WHERE v.tenant_id = ? AND DATE(v.created_at) = CURDATE() AND v.doctor_id IS NOT NULL
        AND v.token_number IS NOT NULL AND v.status IN ('REGISTERED', 'TRIAGE', 'WITH_DOCTOR')
      ORDER BY v.token_number ASC`,
    tenant.id,
  );
  const byDoctor = new Map();
  for (const r of rows) {
    const k = String(r.doctor_id);
    if (!byDoctor.has(k)) byDoctor.set(k, { doctor: r.doctor_name, nowServing: null, waiting: [] });
    const c = byDoctor.get(k);
    if (r.status === "WITH_DOCTOR") c.nowServing = Number(r.token_number);
    else if (c.waiting.length < 8) c.waiting.push(Number(r.token_number));
  }

  return NextResponse.json({
    nowServing: servingRows[0]?.token_number ?? null,
    waiting: waitingRows.map((r) => r.token_number),
    counters: [...byDoctor.values()],
  });
}
