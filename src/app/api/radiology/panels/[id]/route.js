import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { loadStudySets, MODALITIES } from "@/lib/radiologyCatalog";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  modality: z.enum(MODALITIES).optional().or(z.literal("")),
  active: z.coerce.boolean().optional(),
  studies: z.array(z.object({ name: z.string().trim().min(1).max(191), serviceId: z.coerce.number().int().positive().optional() })).min(1).max(30).optional(),
});

export const PATCH = apiRoute("radiology:manage", async (request, { params }) => {
  const { id } = await params;
  const pid = BigInt(id);
  const existing = await tenantDb.radiology_panels.findUnique({ where: { id: pid } });
  if (!existing) return json({ error: "not_found" }, 404);
  const b = await parseBody(request, patchSchema);
  await tenantDb.$transaction(async (tx) => {
    await tx.radiology_panels.update({
      where: { id: pid },
      data: {
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.modality !== undefined ? { modality: b.modality || null } : {}),
        ...(b.active !== undefined ? { active: b.active } : {}),
      },
    });
    if (b.studies) {
      await tx.radiology_panel_items.deleteMany({ where: { panel_id: pid } });
      const seen = new Set();
      let order = 0;
      for (const s of b.studies) {
        if (seen.has(s.name.toLowerCase())) continue;
        seen.add(s.name.toLowerCase());
        await tx.radiology_panel_items.create({ data: { panel_id: pid, study_name: s.name, service_id: s.serviceId ? BigInt(s.serviceId) : null, sort_order: order++ } });
      }
    }
  });
  const all = await loadStudySets(tenantDb);
  return json({ set: all.find((p) => p.id === Number(pid)) });
});
