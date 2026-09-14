"use strict";

const { NextResponse } = require("next/server");
const { getSession } = require("./session");
const { can } = require("./rbac");
const { requiredModules, anyModuleActive } = require("./modules");
const { runWithContext } = require("./requestContext");
const { getTenant } = require("./tenants");

const json = (data, status) => NextResponse.json(data, { status });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Wrap an API route handler with: session check → suspended-tenant check →
 * RBAC check → module-gate check → run the body inside the tenant context so
 * every repo query is scoped to this tenant automatically.
 *
 *   export const POST = apiRoute("patient:create", async (req, { session, tenant }) => { ... });
 *
 * `action` may be null for endpoints that only need "logged in".
 * `tenant` (row: id/name/slug/type/active/allow_doctor_branding) is passed to
 * the handler; it is null for SUPER_ADMIN.
 */
function apiRoute(action, handler) {
  return async (request, routeCtx) => {
    const session = await getSession();
    if (!session) return json({ error: "unauthorized" }, 401);

    let tenant = null;
    if (session.tenantId != null) {
      tenant = await getTenant(session.tenantId);
      if (!tenant) return json({ error: "unauthorized" }, 401);
      if (!tenant.active) return json({ error: "tenant_suspended" }, 403);
    }

    if (action) {
      if (!can(session.role, action)) return json({ error: "forbidden" }, 403);
      const mods = requiredModules(action);
      if (mods.length && !(await anyModuleActive(session.tenantId, mods))) {
        return json({ error: "forbidden" }, 403);
      }
    }

    return runWithContext(
      {
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
        tenantType: tenant?.type ?? null,
      },
      async () => {
        try {
          return await handler(request, { ...routeCtx, session, tenant });
        } catch (err) {
          // Duck-typed, not `instanceof HttpError` — parseBody() (validate.js)
          // and patientApiRoute.js's own HttpError are both separate classes
          // from this one; instanceof would silently miss them and fall
          // through to a raw 500 instead of the intended 400/403/409/etc.
          // Every "clean" thrown error in this codebase carries a numeric
          // `.status`, so that's the actual contract to check.
          if (err && typeof err.status === "number") {
            return json({ error: err.message }, err.status);
          }
          console.error("API route error:", err);
          return json({ error: "internal_error" }, 500);
        }
      },
    );
  };
}

module.exports = { apiRoute, HttpError, json };
