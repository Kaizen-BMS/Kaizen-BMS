"use strict";

/**
 * Analytics rollup scheduler — mirrors src/lib/outboxProcessor.js's exact
 * singleton self-scheduling-loop shape (start()/stop()/globalThis guard,
 * backoff + pause-on-connection/auth-error via the shared
 * dbErrorClassify.js), per this task's own explicit instruction to
 * reuse/extend that pattern rather than introduce a new scheduling
 * library. A completely different cadence and job (recompute today's +
 * yesterday's rollup for every active tenant) than Outbox's
 * claim-a-batch-of-events loop — same shape, not shared loop code, because
 * the two loops do genuinely different things.
 */
const { prisma } = require("../prismaClient");
const { rollupAllTenants } = require("./rollup");
const { isConnectionOrAuthError } = require("../dbErrorClassify");

const MIN_DELAY_MS = 5 * 60 * 1000; // 5 min — "today" stays reasonably fresh without hammering the remote DB
const MAX_DELAY_MS = 60 * 60 * 1000; // back off to at most once an hour on repeated transient failures

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

// Same self-scheduling setTimeout-chain shape as outboxProcessor.js, and
// for the same reason — see that file's own top-of-file comment for the
// real incident (Hostinger's abuse-protection auto-revoking DB access
// after a fixed-interval loop kept hammering it during an outage). This
// loop's normal cadence is already gentle (5 min), but "gentle at first,
// then also pauses correctly" is what keeps it safe under a genuine
// connection/auth failure, not just this loop's start-up speed.
let timerHandle = null;
let running = false;
let paused = false;
let currentDelay = MIN_DELAY_MS;

function scheduleNext(delay) {
  timerHandle = setTimeout(runLoop, delay);
  if (timerHandle.unref) timerHandle.unref();
}

async function runLoop() {
  if (running || paused) return;
  running = true;
  try {
    await tick();
    currentDelay = MIN_DELAY_MS;
  } catch (err) {
    if (isConnectionOrAuthError(err)) {
      paused = true;
      running = false;
      console.error(
        "[analytics] database connection/authorization failure — scheduler PAUSED until the app is restarted. " +
          "Fix the underlying DB access issue first (do not just restart on a loop):",
        err?.message || err,
      );
      return;
    }
    console.error("[analytics] rollup tick failed:", err);
    currentDelay = Math.min(currentDelay * 2, MAX_DELAY_MS);
  } finally {
    running = false;
  }
  if (!paused) scheduleNext(currentDelay);
}

function start() {
  const g = globalThis;
  if (g.__kaizenAnalyticsSchedulerStarted) return;
  g.__kaizenAnalyticsSchedulerStarted = true;
  paused = false;
  currentDelay = MIN_DELAY_MS;
  // Run once shortly after startup too, not just on the first 5-minute mark.
  scheduleNext(0);
}

function stop() {
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  running = false;
  paused = false;
  globalThis.__kaizenAnalyticsSchedulerStarted = false;
}

function isPaused() {
  return paused;
}

module.exports = { start, stop, tick, isPaused };
