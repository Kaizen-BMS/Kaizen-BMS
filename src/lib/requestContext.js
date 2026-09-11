"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

/**
 * Per-request tenant context. Every authenticated API route runs its body
 * inside `runWithContext({ tenantId, role, userId }, fn)`; the repo layer
 * (src/lib/repo/*) reads `getContext()` and injects `tenantId` into every
 * query automatically — a route author cannot forget it.
 */
const als = new AsyncLocalStorage();

function runWithContext(ctx, fn) {
  return als.run(ctx, fn);
}

function getContext() {
  return als.getStore() || null;
}

/** tenantId of the current request, or throw — used by the repo layer. */
function requireTenantId() {
  const ctx = als.getStore();
  if (!ctx || ctx.tenantId == null) {
    throw new Error("No tenant context — repo used outside runWithContext()");
  }
  return ctx.tenantId;
}

module.exports = { runWithContext, getContext, requireTenantId };
