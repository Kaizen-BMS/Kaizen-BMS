import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

// Per-ward occupancy % and average length of stay. Length of stay is
// grouped by each discharged admission's CURRENT bed (i.e. after any
// transfer) rather than tracking time-per-ward across a transfer — a
// deliberate simplification; a patient transferred mid-stay is attributed
// to the ward they ended up in, not split across both.
export const GET = apiRoute("bed:read", async () => {
  const tid = requireTenantId();

  const counts = await tenantDb.$queryRawUnsafe(
    `SELECT ward_type,
            COUNT(*) AS total,
            SUM(status = 'VACANT') AS vacant,
            SUM(status = 'OCCUPIED') AS occupied,
            SUM(status = 'CLEANING') AS cleaning,
            SUM(status = 'MAINTENANCE') AS maintenance
       FROM beds
      WHERE tenant_id = ?
      GROUP BY ward_type`,
    BigInt(tid),
  );

  const los = await tenantDb.$queryRawUnsafe(
    `SELECT b.ward_type,
            AVG(TIMESTAMPDIFF(HOUR, a.admitted_at, a.discharged_at)) / 24.0 AS avg_los_days,
            COUNT(*) AS discharged_count
       FROM admissions a
       JOIN beds b ON b.id = a.bed_id
      WHERE a.tenant_id = ? AND a.discharged_at IS NOT NULL
      GROUP BY b.ward_type`,
    BigInt(tid),
  );
  const losByWard = new Map(los.map((r) => [r.ward_type, r]));

  const wards = counts.map((c) => {
    const total = Number(c.total);
    const occupied = Number(c.occupied);
    const losRow = losByWard.get(c.ward_type);
    return {
      wardType: c.ward_type,
      total,
      vacant: Number(c.vacant),
      occupied,
      cleaning: Number(c.cleaning),
      maintenance: Number(c.maintenance),
      occupancyPct: total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0,
      avgLengthOfStayDays: losRow ? Math.round(Number(losRow.avg_los_days) * 10) / 10 : null,
      dischargedCount: losRow ? Number(losRow.discharged_count) : 0,
    };
  });

  return json({ wards });
});
