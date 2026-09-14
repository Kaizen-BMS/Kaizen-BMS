"use strict";

const { NextResponse } = require("next/server");
const { getPatientSession } = require("./patientSession");
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
 * The Patient Portal's equivalent of apiRoute() — but there is no RBAC here
 * (patients aren't staff roles) and the tenant context is scoped to the
 * verified patient session, never a client-supplied id. `tenantDb`'s
 * auto-scoping (see prismaClient.js) works identically for patient routes
 * since it only ever reads `tenantId` out of this same AsyncLocalStorage
 * context — a route written the normal way is safe by construction either
 * way.
 */
function patientApiRoute(handler) {
  return async (request, routeCtx) => {
    const session = await getPatientSession();
    if (!session) return json({ error: "unauthorized" }, 401);

    const tenant = await getTenant(session.tenantId);
    if (!tenant || !tenant.active) return json({ error: "tenant_suspended" }, 403);

    return runWithContext(
      { userId: null, tenantId: session.tenantId, role: "PATIENT", tenantType: tenant.type },
      async () => {
        try {
          return await handler(request, { ...routeCtx, session, tenant });
        } catch (err) {
          // Duck-typed, not `instanceof HttpError` — parseBody() (validate.js)
          // throws the STAFF apiRoute.js's HttpError class regardless of
          // caller, which is a different class from this file's own
          // HttpError; instanceof would miss it and fall through to a raw
          // 500 instead of the intended 400. Every clean thrown error here
          // carries a numeric `.status`, so that's the real contract.
          if (err && typeof err.status === "number") return json({ error: err.message }, err.status);
          console.error("Patient API route error:", err);
          return json({ error: "internal_error" }, 500);
        }
      },
    );
  };
}

module.exports = { patientApiRoute, HttpError, json };
