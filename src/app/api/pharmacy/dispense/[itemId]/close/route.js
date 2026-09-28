import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToModule, emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// "We don't have the rest — stop asking." A pharmacist who has dispensed
// whatever stock was available (maybe none, maybe a partial amount) closes
// out the line instead of it sitting in the active queue forever waiting
// for restock. This is a WORKFLOW close, never a stock action — it never
// touches pharmacy_stock or pharmacy_stock_movements (nothing more is
// physically given), so the real audit trail of what was actually handed
// over stays exactly as dispensed. It only moves this bookkeeping column
// (dispensed_quantity/status) to its terminal state so the item stops
// showing "Remaining N" and drops out of the active dispensing queue.
export const POST = apiRoute("dispense:create", async (request, ctx) => {
  const { itemId } = await ctx.params;
  const id = BigInt(itemId);
  const tid = requireTenantId();

  const result = await tenantDb.$transaction(async (tx) => {
    const [rawLockedItem] = await tx.$queryRawUnsafe(
      `SELECT * FROM prescription_items WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      id,
      BigInt(tid),
    );
    if (!rawLockedItem) throw new HttpError(404, "not_found");
    const lockedItem = {
      ...rawLockedItem,
      quantity: Number(rawLockedItem.quantity),
      dispensed_quantity: Number(rawLockedItem.dispensed_quantity),
    };
    if (lockedItem.dispensed_quantity >= lockedItem.quantity) throw new HttpError(400, "already fully dispensed");

    await tx.prescription_items.update({
      where: { id },
      data: { dispensed_quantity: lockedItem.quantity, status: "DISPENSED" },
    });

    const allItems = await tx.prescription_items.findMany({
      where: { prescription_id: lockedItem.prescription_id },
      select: { quantity: true, dispensed_quantity: true },
    });
    const allDone = allItems.every((i) => i.dispensed_quantity >= i.quantity);
    const prescriptionStatus = allDone ? "FULFILLED" : "PARTIALLY_FULFILLED";

    await tx.prescriptions.update({
      where: { id: lockedItem.prescription_id },
      data:
        prescriptionStatus === "FULFILLED"
          ? { status: prescriptionStatus, fulfilled_by: BigInt(ctx.session.userId), fulfilled_at: new Date() }
          : { status: prescriptionStatus },
    });

    return { prescriptionId: lockedItem.prescription_id, prescriptionStatus };
  });

  const updatedItem = await tenantDb.prescription_items.findUnique({ where: { id } });

  emitToModule(ctx.session.tenantId, "PHARMACY", "dispense:created", { item: updatedItem, consumed: [] });
  emitToTenant(ctx.session.tenantId, "prescription:updated", {
    prescription: { id: Number(result.prescriptionId), status: result.prescriptionStatus },
  });

  return json({ item: updatedItem, prescriptionStatus: result.prescriptionStatus });
});
