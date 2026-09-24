import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { loadStudySets, MODALITIES } from "@/lib/radiologyCatalog";

export const dynamic = "force-dynamic";

export const setSchema = z.object({
  name: z.string().trim().min(1).max(150),
  modality: z.enum(MODALITIES).optional().or(z.literal("")),
  studies: z.array(z.object({ name: z.string().trim().min(1).max(191), serviceId: z.coerce.number().int().positive().optional() })).min(1).max(30),
});

// Study sets — "Chest X-ray PA + Lateral", "CT Abdomen + Pelvis" — one click orders each study in the set.
export const GET = apiRoute("radiology:read", async () => json({ sets: await loadStudySets(tenantDb) }));

export const POST = apiRoute("radiology:manage", async (request) => {
  const b = await parseBody(request, setSchema);
  if (await tenantDb.radiology_panels.findFirst({ where: { name: b.name }, select: { id: true } })) throw new HttpError(409, "set_already_exists");
  const seen = new Set();
  const studies = b.studies.filter((s) => (seen.has(s.name.toLowerCase()) ? false : (seen.add(s.name.toLowerCase()), true)));
  const created = await tenantDb.$transaction(async (tx) => {
    const p = await tx.radiology_panels.create({ data: { name: b.name, modality: b.modality || null } });
    let order = 0;
    for (const s of studies) {
      await tx.radiology_panel_items.create({ data: { panel_id: p.id, study_name: s.name, service_id: s.serviceId ? BigInt(s.serviceId) : null, sort_order: order++ } });
    }
    return p;
  });
  const all = await loadStudySets(tenantDb);
  return json({ set: all.find((p) => p.id === Number(created.id)) }, 201);
});
