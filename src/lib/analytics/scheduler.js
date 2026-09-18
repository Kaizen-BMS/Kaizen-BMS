"use strict";

/**
 * Analytics rollup scheduler — mirrors src/lib/outboxProcessor.js's exact
 * singleton interval-loop shape (start()/stop()/globalThis guard), per
 * this task's own explicit instruction to reuse/extend that pattern rather
 * than introduce a new scheduling library. A completely different cadence
 * and job (recompute today's + yesterday's rollup for every active
 * tenant) than Outbox's claim-a-batch-of-events loop — same shape, not
 * shared code, because the two loops do genuinely different things.
 */
const { prisma } = require("../prismaClient");
const { rollupAllTenants } = require("./rollup");

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min — "today" stays reasonably fresh without hammering the remote DB

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** One rollup cycle: today (for live-ish dashboards) + yesterday (to catch anything that landed after yesterday's last tick, e.g. a late-night discharge). Records one analytics_rollup_runs row per date. Exported for manual triggering (POST /api/analytics/rollup/run) and tests — no need to wait a real 5-minute interval. */
async function tick() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dates = [isoDate(yesterday), isoDate(now)];

  const results = [];
  for (const dateStr of dates) {
    const run = await prisma.analytics_rollup_runs.create({
      data: { tenant_id: null, rollup_date: new Date(dateStr), status: "RUNNING", started_at: new Date() },
    });
    try {
      const { tenantCount, errors, rowCounts } = await rollupAllTenants(dateStr);
      await prisma.analytics_rollup_runs.update({
        where: { id: run.id },
        data: {
          status: errors > 0 ? "FAILED" : "COMPLETED",
          completed_at: new Date(),
          row_counts: JSON.stringify(rowCounts),
          last_error: errors > 0 ? `${errors} of ${tenantCount} tenants failed — see row_counts` : null,
        },
      });
      results.push({ date: dateStr, tenantCount, errors });
    } catch (err) {
      await prisma.analytics_rollup_runs.update({
        where: { id: run.id },
        data: { status: "FAILED", completed_at: new Date(), last_error: String(err.message || err).slice(0, 500) },
      });
      results.push({ date: dateStr, error: String(err.message || err) });
    }
  }
  return results;
}

let intervalHandle = null;

function start() {
  const g = globalThis;
  if (g.__kaizenAnalyticsSchedulerStarted) return;
  g.__kaizenAnalyticsSchedulerStarted = true;
  // Run once shortly after startup too, not just on the first 5-minute mark.
  tick().catch((err) => console.error("[analytics] initial rollup tick failed:", err));
  intervalHandle = setInterval(() => {
    tick().catch((err) => console.error("[analytics] rollup tick failed:", err));
  }, POLL_INTERVAL_MS);
  if (intervalHandle.unref) intervalHandle.unref();
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  globalThis.__kaizenAnalyticsSchedulerStarted = false;
}

module.exports = { start, stop, tick };
