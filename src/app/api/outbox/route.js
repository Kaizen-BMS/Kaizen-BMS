import { apiRoute, json } from "@/lib/apiRoute";
import { prisma, tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "PROCESSING", "PROCESSED", "FAILED"];

/**
 * Minimal internal Outbox observability — Phase 4 (CLAUDE.md "Outbox —
 * durable domain events"). Deliberately small: counts by status, counts
 * by event type, and the 5 most recent failures (event type, attempts,
 * error message — never the payload). No raw payloads exposed, no
 * pagination, no filters — a bigger operational dashboard is a later
 * phase, not this one.
 *
 * Scope is derived from the verified session, never a client parameter:
 * a SUPER_ADMIN (session.tenantId === null) sees platform-wide counts via
 * the raw `prisma` client; anyone else (HOSPITAL_ADMIN, via the `"*"`
 * wildcard `outbox:read` requires) sees only their own tenant's counts,
 * via `tenantDb`'s auto tenant-scoping — there is no code path here that
 * could return another tenant's data even if asked to.
 */
export const GET = apiRoute("outbox:read", async (_request, { session }) => {
  const isPlatform = session.tenantId == null;
  const db = isPlatform ? prisma : tenantDb;

  const [statusGroups, typeGroups, recentFailures] = await Promise.all([
    db.outbox_events.groupBy({ by: ["status"], _count: true }),
    db.outbox_events.groupBy({ by: ["event_type"], _count: true }),
    db.outbox_events.findMany({
      where: { status: "FAILED" },
      orderBy: { id: "desc" },
      take: 5,
      select: {
        event_id: true,
        event_type: true,
        attempts: true,
        last_error: true,
        occurred_at: true,
        created_at: true,
        ...(isPlatform ? { tenant_id: true } : {}),
      },
    }),
  ]);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const g of statusGroups) counts[g.status] = g._count;

  const byEventType = {};
  for (const g of typeGroups) byEventType[g.event_type] = g._count;

  return json({
    scope: isPlatform ? "PLATFORM" : "TENANT",
    counts,
    byEventType,
    recentFailures: recentFailures.map((f) => ({
      eventId: f.event_id,
      eventType: f.event_type,
      attempts: f.attempts,
      lastError: f.last_error,
      occurredAt: f.occurred_at,
      createdAt: f.created_at,
      ...(isPlatform ? { tenantId: Number(f.tenant_id) } : {}),
    })),
  });
});
