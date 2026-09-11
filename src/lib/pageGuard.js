"use strict";

const { redirect } = require("next/navigation");
const { getSession } = require("./session");
const { can } = require("./rbac");
const { anyModuleActive } = require("./modules");
const { getTenant } = require("./tenants");

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
  if (session.tenantId != null && (!tenant || !tenant.active)) {
    redirect("/login?suspended=1");
  }

  if (action && !can(session.role, action)) redirect("/dashboard");
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
