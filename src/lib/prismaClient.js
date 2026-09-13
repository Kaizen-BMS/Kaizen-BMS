"use strict";

/**
 * Prisma Client, wired to the SAME database as src/lib/db.js (mysql2) — one
 * MySQL server, two client libraries, both fine side by side. Cached on
 * globalThis in dev the same way the mysql2 pool is, so hot-reload doesn't
 * spawn a new client per request.
 *
 * Tenant safety: `tenantDb` (the default export) wraps the raw client with a
 * query extension that automatically injects `tenant_id` from the SAME
 * AsyncLocalStorage context requestContext.js already provides — the same
 * "physically cannot forget the tenant filter" guarantee the mysql2 repo
 * layer (src/lib/repo/tenant.js) gives, now for Prisma model calls too.
 * Use the raw `prisma` export only for genuinely cross-tenant work
 * (SUPER_ADMIN platform screens, login's pre-session lookup).
 *
 * IMPORTANT — AsyncLocalStorage + Prisma's native query engine: the context
 * only survives if the `runWithContext(ctx, fn)` callback is an `async`
 * function that itself `await`s the Prisma call —
 *   runWithContext(ctx, async () => { return await tenantDb.x.findMany(); })
 * NOT
 *   runWithContext(ctx, () => tenantDb.x.findMany())
 * The second form loses the context (verified — Prisma's query engine
 * crosses a native binding that breaks AsyncLocalStorage's causal chain
 * unless the JS call site is itself awaiting). apiRoute()'s handler wrapper
 * already awaits internally, so any route handler that `await`s its Prisma
 * calls (the normal way to write one) is safe by construction — this note
 * is for anything written outside that wrapper.
 */
const { PrismaClient } = require("@prisma/client");
const { requireTenantId } = require("./requestContext");

// Every id/tenant_id column is an unsigned BIGINT, so Prisma returns JS
// BigInt for them — and JSON.stringify() throws on a raw BigInt. All our
// real values are well within Number.MAX_SAFE_INTEGER (sequential
// auto-increment ids), so converting to Number for API responses is safe.
// Patched once, globally, rather than converting at every call site — the
// standard, well-known way to use Prisma BigInt columns with JSON APIs.
// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function () {
  return Number(this);
};

const g = globalThis;

function makeClient() {
  return new PrismaClient({
    // Prisma's interactive-transaction default (maxWait 2000ms, timeout
    // 5000ms) assumes a low-latency DB connection. This project's DB is a
    // remote Hostinger MySQL server — observed per-query round trips of
    // 300ms-3.5s — so a `$transaction(async (tx) => {...})` doing several
    // sequential awaited writes (e.g. the prescription + items + allergy
    // acks transaction) blew past 5s and Prisma killed the transaction
    // mid-flight (P2028 "Transaction already closed"), even though every
    // individual query was fine. Raised generously; local/low-latency
    // deployments later can lower this back down.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });
}

const prisma = g.__kaizenPrisma || makeClient();
if (process.env.NODE_ENV !== "production") g.__kaizenPrisma = prisma;

// Models that carry their own tenant_id column and must always be filtered/
// stamped by it. (`bill_items`, `payments`, `discounts` and `refunds` are
// all scoped transitively through `bills` and are deliberately excluded —
// none of them has its own tenant_id column; filter by joining/checking the
// parent bill. `tenants`, `users` and `migrations` are deliberately
// excluded: `tenants` IS the tenant table, `users.tenant_id` is nullable
// for SUPER_ADMIN and needs case-by-case handling, `migrations` is a
// project-internal table.)
const TENANT_SCOPED_MODELS = new Set([
  "admissions",
  "appointments",
  "attendance_breaks",
  "attendance_logs",
  "bed_transfers",
  "beds",
  "bills",
  "consent_forms",
  "consultations",
  "doctor_slots",
  "feedback",
  "follow_ups",
  "form_templates",
  "lab_orders",
  "nursing_notes",
  "patients",
  "pharmacy_stock",
  "pharmacy_stock_movements",
  "pharmacy_thresholds",
  "prescription_item_acks",
  "prescription_items",
  "prescriptions",
  "print_branding",
  "referral_sources",
  "staff_members",
  "tenant_modules",
  "visits",
]);

const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
const WRITE_WHERE_OPS = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

const tenantDb = prisma.$extends({
  name: "tenantScoping",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_SCOPED_MODELS.has(model)) return query(args);

        const tenantId = BigInt(requireTenantId());
        args = args || {};

        if (READ_OPS.has(operation) || WRITE_WHERE_OPS.has(operation)) {
          args.where = { ...(args.where || {}), tenant_id: tenantId };
        }
        if (operation === "upsert") {
          args.create = { ...(args.create || {}), tenant_id: tenantId };
        }
        if (CREATE_OPS.has(operation)) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) => ({ ...d, tenant_id: tenantId }));
          } else {
            args.data = { ...(args.data || {}), tenant_id: tenantId };
          }
        }
        return query(args);
      },
    },
  },
});

module.exports = { prisma, tenantDb, TENANT_SCOPED_MODELS };
