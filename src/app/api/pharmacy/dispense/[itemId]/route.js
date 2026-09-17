import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { resolveInstance } from "@/lib/moduleInstances";
import { emitToModule, emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const dispenseSchema = z.object({
  quantity: z.coerce.number().int().min(1).optional(),
  // Optional — omitted (every existing caller today) resolves to the
  // tenant's default Pharmacy instance, exactly today's behavior. Real
  // prescription-to-instance routing (which pharmacy a given prescription
  // should draw from) is deferred to when Module Connections actually
  // carry that routing — see CLAUDE.md "Platform rebuild — Phase 2".
  moduleInstanceId: z.coerce.number().int().positive().optional(),
});

// FEFO dispensing: consumes the item's remaining quantity from whichever
// non-expired batches of that medicine run out soonest, oldest-expiry
// first, across as many batches as it takes, WITHIN ONE Pharmacy
// module_instance — never drawing from another instance's stock. Partial
// dispensing is allowed when stock falls short — never a strict
// all-or-nothing block.
export const POST = apiRoute("dispense:create", async (request, ctx) => {
  const { itemId } = await ctx.params;
  const id = BigInt(itemId);
  const tid = requireTenantId();

  const item = await tenantDb.prescription_items.findUnique({ where: { id } });
  if (!item) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, dispenseSchema);
  // Fast, friendly pre-check only — NOT the authoritative one. The real
  // guarantee comes from the locked re-read inside the transaction below
  // (same "pre-check for a clean message, the lock is what's actually
  // safe under a race" shape as this project's token-override/tariff
  // versioning code).
  if (item.quantity - item.dispensed_quantity <= 0) throw new HttpError(400, "already fully dispensed");
  const instance = await resolveInstance(tenantDb, ctx.session.tenantId, "PHARMACY", body.moduleInstanceId);

  const result = await tenantDb.$transaction(async (tx) => {
    // Lock the prescription_items row itself, not just the stock batches
    // — a REAL bug, found live while testing Phase 8C's own availability
    // endpoint: two concurrent dispense requests on the SAME item both
    // read `dispensed_quantity` before either committed, both computed
    // `newDispensed` from that same stale value, and the second write
    // silently overwrote the first's contribution (a lost update) even
    // though the STOCK deduction itself was correctly serialized by the
    // FOR UPDATE below. Locking this row too forces concurrent requests
    // on the same item to serialize, so every read after this point is
    // guaranteed fresh — see CLAUDE.md "First real cross-module data
    // exchange — Prescription → Pharmacy" Part 16.
    const [rawLockedItem] = await tx.$queryRawUnsafe(
      `SELECT * FROM prescription_items WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      id,
      BigInt(tid),
    );
    if (!rawLockedItem) throw new HttpError(404, "not_found");
    // `quantity`/`dispensed_quantity` are INT UNSIGNED columns — Prisma's
    // raw-query deserializer maps those to BigInt (unlike the plain
    // signed INT `pharmacy_stock.quantity` below, which comes back as a
    // Number), so they need an explicit, safe conversion before any
    // arithmetic — real quantities here are always tiny, nowhere near
    // BigInt range. Caught live: `Math.min()` throws on a bare BigInt.
    const lockedItem = {
      ...rawLockedItem,
      quantity: Number(rawLockedItem.quantity),
      dispensed_quantity: Number(rawLockedItem.dispensed_quantity),
    };
    const outstanding = lockedItem.quantity - lockedItem.dispensed_quantity;
    if (outstanding <= 0) throw new HttpError(400, "already fully dispensed");
    const requested = Math.min(body.quantity ?? outstanding, outstanding);

    const batches = await tx.$queryRawUnsafe(
      `SELECT * FROM pharmacy_stock
        WHERE tenant_id = ? AND module_instance_id = ? AND medicine_name = ? AND quantity > 0
          AND (expiry_date IS NULL OR expiry_date >= CURDATE())
        ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, id ASC
        FOR UPDATE`,
      BigInt(tid),
      instance.id,
      lockedItem.medicine_name,
    );

    let remaining = requested;
    const consumed = [];
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      if (take <= 0) continue;
      await tx.pharmacy_stock.update({
        where: { id: batch.id },
        data: { quantity: { decrement: take } },
      });
      await tx.pharmacy_stock_movements.create({
        data: {
          stock_id: batch.id,
          type: "DISPENSE",
          quantity_delta: -take,
          prescription_item_id: id,
          performed_by: BigInt(ctx.session.userId),
        },
      });
      consumed.push({ batchId: Number(batch.id), batchNumber: batch.batch_number, quantity: take });
      remaining -= take;
    }

    const dispensedNow = requested - remaining;
    const newDispensed = lockedItem.dispensed_quantity + dispensedNow;
    const itemStatus =
      newDispensed >= lockedItem.quantity ? "DISPENSED" : dispensedNow > 0 ? "PENDING" : "OUT_OF_STOCK";
    const primaryBatch = consumed[consumed.length - 1]?.batchNumber ?? lockedItem.batch_number;

    await tx.prescription_items.update({
      where: { id },
      data: { dispensed_quantity: newDispensed, status: itemStatus, batch_number: primaryBatch },
    });

    const allItems = await tx.prescription_items.findMany({
      where: { prescription_id: lockedItem.prescription_id },
      select: { quantity: true, dispensed_quantity: true },
    });
    const allDone = allItems.every((i) => i.dispensed_quantity >= i.quantity);
    const anyDone = allItems.some((i) => i.dispensed_quantity > 0);
    const prescriptionStatus = allDone ? "FULFILLED" : anyDone ? "PARTIALLY_FULFILLED" : "PENDING";

    if (prescriptionStatus === "FULFILLED") {
      await tx.prescriptions.update({
        where: { id: lockedItem.prescription_id },
        data: { status: prescriptionStatus, fulfilled_by: BigInt(ctx.session.userId), fulfilled_at: new Date() },
      });
    } else {
      await tx.prescriptions.update({
        where: { id: lockedItem.prescription_id },
        data: { status: prescriptionStatus },
      });
    }

    return { consumed, dispensedNow, itemStatus, prescriptionStatus };
  });

  const updatedItem = await tenantDb.prescription_items.findUnique({ where: { id } });
  const updatedBatches = [];
  for (const c of result.consumed) {
    const batch = await tenantDb.pharmacy_stock.findUnique({ where: { id: BigInt(c.batchId) } });
    if (batch) updatedBatches.push(batch);
  }

  emitToModule(ctx.session.tenantId, "PHARMACY", "dispense:created", {
    item: updatedItem,
    consumed: result.consumed,
  });
  emitToModule(ctx.session.tenantId, "PHARMACY", "stock:updated", { batches: updatedBatches });
  emitToTenant(ctx.session.tenantId, "prescription:updated", {
    prescription: { id: Number(item.prescription_id), status: result.prescriptionStatus },
  });

  return json({
    item: updatedItem,
    consumed: result.consumed,
    prescriptionStatus: result.prescriptionStatus,
  });
});
