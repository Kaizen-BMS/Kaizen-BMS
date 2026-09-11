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

  return NextResponse.json({
    nowServing: servingRows[0]?.token_number ?? null,
    waiting: waitingRows.map((r) => r.token_number),
  });
}
