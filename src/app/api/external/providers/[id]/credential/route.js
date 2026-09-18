import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { setCredentialSchema } from "@/lib/externalProviders";
import { setCredential } from "@/lib/externalCredentials";

export const dynamic = "force-dynamic";

// Set/rotate a provider's secret. Never returns the secret — the response
// only confirms it was stored, same "write-only" shape a password-set
// endpoint would use. getSecretForAdapterUse() (externalCredentials.js) is
// the only function that ever reads it back, and it's never called from a
// route that serializes a response.
export const PUT = apiRoute("external:manage", async (request, { session, params }) => {
  const { id } = await params;
  const provider = await tenantDb.external_providers.findUnique({ where: { id: BigInt(id) } });
  if (!provider) throw new HttpError(404, "provider_not_found");

  const body = await parseBody(request, setCredentialSchema);
  await setCredential(tenantDb, { tenantId: session.tenantId, providerId: provider.id, secret: body.secret, fields: body.fields, actorUserId: session.userId });
  return json({ ok: true, hasCredential: true });
});
