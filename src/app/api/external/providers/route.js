import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { createProviderSchema, serializeProvider } from "@/lib/externalProviders";
import { setCredential, hasCredential } from "@/lib/externalCredentials";

export const dynamic = "force-dynamic";

// External Integration Foundation — provider registry CRUD. Wildcard-only
// action (external:read/external:manage — see rbac.js), same shape as
// Module Instances/Connections: not a rentable clinical module, so
// deliberately not gated by ACTION_MODULE either (modules.js).

export const GET = apiRoute("external:read", async (request, { session }) => {
  const providers = await tenantDb.external_providers.findMany({
    where: {},
    orderBy: { created_at: "desc" },
  });
  const withCred = await Promise.all(
    providers.map(async (p) => ({ ...p, _hasCredential: await hasCredential(tenantDb, p.id) })),
  );
  return json({ providers: withCred.map(serializeProvider) });
});

export const POST = apiRoute("external:manage", async (request, { session }) => {
  const body = await parseBody(request, createProviderSchema);
  let provider;
  try {
    provider = await tenantDb.external_providers.create({
      data: {
        provider_type: body.providerType,
        provider_code: body.providerCode,
        name: body.name,
        base_url: body.baseUrl || null,
        api_version: body.apiVersion || null,
        environment: body.environment,
        active: true,
        capabilities: JSON.stringify(body.capabilities || []),
        config: body.config ? JSON.stringify(body.config) : null,
        created_by: session.userId,
      },
    });
  } catch (err) {
    // uq_external_providers_tenant_code_env — one row per (provider code,
    // environment) per tenant; a second SANDBOX (or PRODUCTION) row for
    // the same vendor code is a real, actionable conflict, not a crash.
    if (err && err.code === "P2002") throw new HttpError(409, "provider_already_registered_for_this_environment");
    throw err;
  }
  // A freshly created provider never has a credential yet (that's a
  // separate call) — without this, deriveHealth() would see
  // `hasCredential: undefined` and skip straight past the CONFIG_ERROR
  // check, showing a brand-new, not-yet-usable provider as CONNECTED.
  return json({ provider: serializeProvider({ ...provider, _hasCredential: false }) }, 201);
});
