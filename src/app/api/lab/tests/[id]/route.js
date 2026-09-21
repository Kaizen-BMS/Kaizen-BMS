import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { changeTariff } from "@/lib/pricing";
import { testSchema, loadCatalog } from "@/lib/labCatalog";

export const dynamic = "force-dynamic";

const patchSchema = testSchema.partial().extend({ active: z.boolean().optional() });

// Edit a test: details, price (a new price version — old bills keep the old price) or on/off.
export const PATCH = apiRoute("labtest:manage", async (request, { session, params }) => {
  const { id } = await params;
  const b = await parseBody(request, patchSchema);
  const uid = BigInt(session.userId);
  const t = await tenantDb.lab_tests.findUnique({ where: { id: BigInt(id) } });
  if (!t) return json({ error: "not_found" }, 404);
  await tenantDb.$transaction(async (tx) => {
    if (b.name !== undefined || b.active !== undefined) {
      await tx.services.update({ where: { id: t.service_id }, data: { ...(b.name !== undefined ? { name: b.name } : {}), ...(b.active !== undefined ? { active: b.active } : {}), updated_by: uid } });
    }
    const d = {};
    if (b.sampleType !== undefined) d.sample_type = b.sampleType || null;
    if (b.units !== undefined) d.units = b.units || null;
    if (b.referenceRange !== undefined) d.reference_range = b.referenceRange || null;
    if (b.turnaroundHours !== undefined) d.turnaround_hours = b.turnaroundHours;
    if (b.instructions !== undefined) d.instructions = b.instructions || null;
    if (Object.keys(d).length) await tx.lab_tests.update({ where: { id: t.id }, data: d });
    if (b.price !== undefined) {
      const half = (b.gst ?? 0) / 2;
      await changeTariff(tx, { serviceId: Number(t.service_id), price: b.price, cgstRate: half, sgstRate: half, reason: "Price changed" }, uid);
    }
  });
  const all = await loadCatalog(tenantDb);
  return json({ test: all.find((x) => x.id === Number(t.id)) });
});
