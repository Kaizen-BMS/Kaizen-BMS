import { NextResponse } from "next/server";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { runWithContext } from "@/lib/requestContext";
import { authenticateWebhook } from "@/lib/webhookFramework";
import { recordWebhookEvent, markProcessed, markFailed } from "@/lib/webhookInbox";
import { validateContractPayload } from "@/lib/dataContractValidator";
import { getContract } from "@/lib/dataContracts";
import { updateStatusByExternalRef } from "@/lib/externalOrders";
import { resolveInternalId } from "@/lib/externalIdentifiers";
import { recordSuccess, recordFailure } from "@/lib/integrationHealth";
import { emitToModule, emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const json = (data, status) => NextResponse.json(data, { status });

/**
 * Inbound webhook receiver — deliberately NOT wrapped in apiRoute(): there
 * is no staff session here, by design (CLAUDE.md's own convention for
 * unauthenticated-by-nature endpoints, same precedent as /api/display/*).
 * Trust comes ONLY from the HMAC signature verified against this specific
 * provider's stored secret — tenant is resolved from the provider row
 * itself, NEVER from anything in the request body (this task's own
 * explicit, non-negotiable rule). The provider resolution + signature +
 * replay-window + JSON-parse prefix is shared with the pharmacy webhook
 * route via src/lib/webhookFramework.js (TASK 8's "provider-neutral
 * webhook framework") — everything from here down is this provider
 * type's own business logic.
 *
 * Pipeline (CLAUDE.md "Inbound webhook / Inbox"):
 *   resolve provider -> verify signature -> verify replay window ->
 *   Inbox idempotency -> Data Contract validation -> business transaction
 *   (update the EXISTING lab_orders row — no parallel result record) ->
 *   realtime emit reusing the EXACT SAME "lab:result" event internal
 *   result-entry already fires, so Clinical/Billing/Workflow/Patient
 *   Portal all pick this up with ZERO new code on their side.
 */
export async function POST(request, ctx) {
  const { providerId } = await ctx.params;
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");

  const auth = await authenticateWebhook({
    providerId,
    providerType: "LAB",
    rawBody,
    signatureHeader: signature,
    timestampHeader: timestamp,
  });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { provider, tenantId, body } = auth;

  let outcome;
  try {
    outcome = await runWithContext({ tenantId }, async () => {
      return await tenantDb.$transaction(async (tx) => {
        const { duplicate, row } = await recordWebhookEvent(tx, {
          tenantId,
          providerId: provider.id,
          providerEventId: body.providerEventId,
          eventType: "LAB_RESULT",
          payload: body,
          signatureValid: true,
        });
        if (duplicate) return { duplicate: true };

        // providerEventId is Inbox/envelope metadata (the idempotency key),
        // never part of the Data Contract's own field whitelist — stripped
        // before validation so a real webhook's own delivery id doesn't
        // trip validateContractPayload()'s forbidden-field check.
        const { providerEventId: _pid, ...contractPayload } = body;
        const validation = validateContractPayload("EXTERNAL_LAB_RESULT", contractPayload, {
          sourceModule: getContract("EXTERNAL_LAB_RESULT").sourceModule,
          targetModule: getContract("EXTERNAL_LAB_RESULT").targetModule,
        });
        if (!validation.valid) {
          await markFailed(tx, row.id, validation.errors.join(","));
          return { invalid: true, errors: validation.errors };
        }

        const labOrderId = await resolveInternalId(tx, { tenantId, providerId: provider.id, entityType: "LAB_ORDER", externalId: body.externalOrderRef }).catch(() => null);
        const resolvedLabOrderId = labOrderId || body.labOrderId;
        if (!resolvedLabOrderId) {
          await markFailed(tx, row.id, "unresolvable_lab_order");
          return { invalid: true, errors: ["unresolvable_lab_order"] };
        }

        await updateStatusByExternalRef(tx, { tenantId, providerId: provider.id, externalOrderRef: body.externalOrderRef, status: "COMPLETED", responsePayload: body });

        // Reuses the EXACT SAME lab_orders row + columns internal result
        // entry writes — an external result and an internal one are
        // indistinguishable to everything downstream, by design.
        const labOrder = await tx.lab_orders.update({
          where: { id: BigInt(resolvedLabOrderId) },
          data: {
            status: "RESULTED",
            results: JSON.stringify([{ testName: "External result", result: body.findings || "See external report", flag: "NORMAL" }]),
            resulted_at: body.resultedAt ? new Date(body.resultedAt) : new Date(),
          },
        });

        await markProcessed(tx, row.id);
        return { labOrder };
      });
    });
  } catch (err) {
    console.error("[webhook:lab] processing failed", err);
    await recordFailure(prisma, provider.id, { errorCategory: "processing_error" });
    return json({ error: "processing_failed" }, 500);
  }

  if (outcome.duplicate) return json({ ok: true, duplicate: true }, 200);
  if (outcome.invalid) return json({ error: "invalid_payload", details: outcome.errors }, 422);

  await recordSuccess(prisma, provider.id);
  // Same event name + shape internal result entry already emits — every
  // existing downstream consumer (billingEvents.js, LAB_RESULT_BILLING
  // workflow, patient portal) reacts with zero new code.
  emitToModule(tenantId, "LAB", "laborder:updated", { labOrder: outcome.labOrder });
  emitToTenant(tenantId, "lab:result", { labOrder: outcome.labOrder });

  return json({ ok: true }, 200);
}
