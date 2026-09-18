import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { updateProviderSchema, serializeProvider, parseConfig } from "@/lib/externalProviders";
import { hasCredential } from "@/lib/externalCredentials";

export const dynamic = "force-dynamic";

async function loadProvider(id) {
  const provider = await tenantDb.external_providers.findUnique({ where: { id: BigInt(id) } });
  if (!provider) throw new HttpError(404, "provider_not_found");
  return provider;
}

export const GET = apiRoute("external:read", async (request, { params }) => {
  const { id } = await params;
  const provider = await loadProvider(id);
  const hasCred = await hasCredential(tenantDb, provider.id);
  return json({ provider: serializeProvider({ ...provider, _hasCredential: hasCred }) });
});

export const PATCH = apiRoute("external:manage", async (request, { params }) => {
  const { id } = await params;
  const provider = await loadProvider(id);
  const body = await parseBody(request, updateProviderSchema);

  const data = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.baseUrl !== undefined) data.base_url = body.baseUrl || null;
  if (body.apiVersion !== undefined) data.api_version = body.apiVersion || null;
  if (body.environment !== undefined) data.environment = body.environment;
  if (body.active !== undefined) data.active = body.active;
  if (body.capabilities !== undefined) data.capabilities = JSON.stringify(body.capabilities);
  if (body.config !== undefined) {
    // Shallow-merged onto the existing config, not replaced outright — an
    // admin filling in the webhook secret's header name today shouldn't
    // have to re-supply the base URLs they set yesterday.
    data.config = JSON.stringify({ ...parseConfig(provider.config), ...body.config });
  }

  const updated = await tenantDb.external_providers.update({ where: { id: provider.id }, data });
  const hasCred = await hasCredential(tenantDb, provider.id);
  return json({ provider: serializeProvider({ ...updated, _hasCredential: hasCred }) });
});
