import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { changeTariff } from "@/lib/pricing";
import { studySchema, loadStudies } from "@/lib/radiologyCatalog";

export const dynamic = "force-dynamic";

const patchSchema = studySchema.partial().extend({ active: z.boolean().optional() });

// Edit a study: details, price (a new price version — old bills keep the old price) or on/off.
export const PATCH = apiRoute("radiology:manage", async (request, { session, params }) => {
  const { id } = await params;
  const b = await parseBody(request, patchSchema);
  const uid = BigInt(session.userId);
  const t = await tenantDb.radiology_tests.findUnique({ where: { id: BigInt(id) } });
  if (!t) return json({ error: "not_found" }, 404);
  await tenantDb.$transaction(async (tx) => {
    if (b.name !== undefined || b.active !== undefined || b.modality !== undefined) {
      await tx.services.update({
        where: { id: t.service_id },
        data: {
          ...(b.name !== undefined ? { name: b.name } : {}),
          ...(b.active !== undefined ? { active: b.active } : {}),
          ...(b.modality !== undefined ? { category: b.modality } : {}),
          updated_by: uid,
        },
      });
    }
    const d = {};
    if (b.modality !== undefined) d.modality = b.modality;
    if (b.bodyPart !== undefined) d.body_part = b.bodyPart || null;
    if (b.contrastOption !== undefined) d.contrast_option = b.contrastOption;
    if (b.preparation !== undefined) d.preparation = b.preparation || null;
    if (b.turnaroundHours !== undefined) d.turnaround_hours = b.turnaroundHours;
    if (Object.keys(d).length) await tx.radiology_tests.update({ where: { id: t.id }, data: d });
    if (b.price !== undefined) {
      const half = (b.gst ?? 0) / 2;
      await changeTariff(tx, { serviceId: Number(t.service_id), price: b.price, cgstRate: half, sgstRate: half, reason: "Price changed" }, uid);
    }
  });
  const all = await loadStudies(tenantDb);
  return json({ study: all.find((x) => x.id === Number(t.id)) });
});
