import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { serializeTariff } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// Deliberately narrow: the ONLY thing a tariff can be PATCHed to is
// active=false — an emergency undo for a data-entry mistake caught right
// after creation. Price/dates/rates are immutable once created; a real
// price change always goes through POST /api/tariffs (a new version) —
// see CLAUDE.md "Pricing / Tariff — no destructive editing".
const patchSchema = z.object({ active: z.literal(false) });

export const PATCH = apiRoute("tariff:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const tariffId = BigInt(id);

  const existing = await tenantDb.tariffs.findUnique({ where: { id: tariffId } });
  if (!existing) return json({ error: "not_found" }, 404);

  await parseBody(request, patchSchema);

  const updated = await tenantDb.tariffs.update({
    where: { id: tariffId },
    data: { active: false, updated_by: BigInt(ctx.session.userId) },
    include: { services: true },
  });

  emitToModule(ctx.session.tenantId, "BILLING", "tariff:updated", { tariff: serializeTariff(updated) });
  return json({ tariff: serializeTariff(updated) });
});
