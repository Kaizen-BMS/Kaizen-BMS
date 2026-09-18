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
 * Mirrors src/app/api/webhooks/lab/[providerId]/route.js exactly, sharing
 * the same authenticateWebhook() prefix (src/lib/webhookFramework.js). The
 * one structural difference: internal `pharmacy_stock`/
 * `pharmacy_stock_movements` are NEVER touched here — only
 * `prescription_items.status`/`dispensed_quantity` are updated, the same
 * columns the internal FEFO dispense route writes, so existing OPD/IPD
 * billing (which already scans `dispensed_quantity > 0` regardless of
 * source) picks this up for free. This is the concrete guarantee behind
 * "internal inventory must remain separate from external inventory."
 */
export async function POST(request, ctx) {
  const { providerId } = await ctx.params;
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");

  const auth = await authenticateWebhook({
    providerId,
    providerType: "PHARMACY",
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
          eventType: "PHARMACY_FULFILLMENT",
          payload: body,
          signatureValid: true,
        });
        if (duplicate) return { duplicate: true };

        // providerEventId is envelope/Inbox metadata, not a contract field —
        // stripped before validation, same reasoning as the lab webhook.
        const { providerEventId: _pid, ...contractPayload } = body;
        const contract = getContract("EXTERNAL_PHARMACY_FULFILLMENT");
        const validation = validateContractPayload("EXTERNAL_PHARMACY_FULFILLMENT", contractPayload, {
          sourceModule: contract.sourceModule,
          targetModule: contract.targetModule,
        });
        if (!validation.valid) {
          await markFailed(tx, row.id, validation.errors.join(","));
          return { invalid: true, errors: validation.errors };
        }

        const itemId = await resolveInternalId(tx, { tenantId, providerId: provider.id, entityType: "PRESCRIPTION_ITEM", externalId: body.externalOrderRef }).catch(() => null);
        const resolvedItemId = itemId || body.prescriptionItemId;
        if (!resolvedItemId) {
          await markFailed(tx, row.id, "unresolvable_prescription_item");
          return { invalid: true, errors: ["unresolvable_prescription_item"] };
        }

        await updateStatusByExternalRef(tx, { tenantId, providerId: provider.id, externalOrderRef: body.externalOrderRef, status: "COMPLETED", responsePayload: body });

        const current = await tx.prescription_items.findUnique({ where: { id: BigInt(resolvedItemId) } });
        if (!current) {
          await markFailed(tx, row.id, "prescription_item_not_found");
          return { invalid: true, errors: ["prescription_item_not_found"] };
        }
        const fulfilled = body.quantityFulfilled != null ? Number(body.quantityFulfilled) : current.quantity;
        const newDispensed = Math.min(current.quantity, current.dispensed_quantity + fulfilled);
        const item = await tx.prescription_items.update({
          where: { id: current.id },
          data: { dispensed_quantity: newDispensed, status: newDispensed >= current.quantity ? "DISPENSED" : current.status },
        });

        await markProcessed(tx, row.id);
        return { item };
      });
    });
  } catch (err) {
    console.error("[webhook:pharmacy] processing failed", err);
    await recordFailure(prisma, provider.id, { errorCategory: "processing_error" });
    return json({ error: "processing_failed" }, 500);
  }

  if (outcome.duplicate) return json({ ok: true, duplicate: true }, 200);
  if (outcome.invalid) return json({ error: "invalid_payload", details: outcome.errors }, 422);

  await recordSuccess(prisma, provider.id);
  // Same event name + shape internal FEFO dispensing already emits —
  // billingEvents.js's existing "dispense:created" listener (IPD running
  // bill) and OPD checkout's dispensed_quantity scan both react with zero
  // new billing code. Never claims internal stock was deducted — it
  // wasn't, and never is for an externally-fulfilled item.
  emitToModule(tenantId, "PHARMACY", "dispense:created", { item: outcome.item, consumed: [] });
  emitToTenant(tenantId, "prescription:updated", { prescription: { id: Number(outcome.item.prescription_id) } });

  return json({ ok: true }, 200);
}
