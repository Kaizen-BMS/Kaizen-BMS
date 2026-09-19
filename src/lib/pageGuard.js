"use strict";

const { redirect } = require("next/navigation");
const { getSession } = require("./session");
const { canPlatform } = require("./rbac");
const { anyModuleActive } = require("./modules");
const { getTenant } = require("./tenants");
const { sessionFacilityOk } = require("./orgAccess");

/**
 * Server-component gate for a dashboard screen — the UI equivalent of
 * apiRoute()'s checks. Redirects instead of returning a status.
 *
 *   const { session, tenant } = await guardPage({ action: "stock:read", modules: ["PHARMACY"] });
 */
async function guardPage({ action, modules } = {}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const tenant =
    session.tenantId == null ? null : await getTenant(session.tenantId);
  if (session.tenantId != null && (!tenant || !tenant.active || tenant.owner_enabled === false)) {
    redirect("/login?suspended=1");
  }
  if (!(await sessionFacilityOk(session))) redirect("/login");

  // canPlatform() — see rbac.js: can(role, action) plus, for
  // tenant:read/tenant:manage specifically, session.role === "SUPER_ADMIN".
  if (action && !canPlatform(session, action)) redirect("/dashboard");
  if (
    modules &&
    modules.length &&
    !(await anyModuleActive(session.tenantId, modules))
  ) {
    redirect("/dashboard");
  }

  return { session, tenant };
}

module.exports = { guardPage };
