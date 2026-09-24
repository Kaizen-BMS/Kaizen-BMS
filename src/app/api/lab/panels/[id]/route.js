import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { loadPanels } from "@/lib/labCatalog";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  sampleType: z.string().trim().max(60).optional().or(z.literal("")),
  active: z.coerce.boolean().optional(),
  tests: z.array(z.object({ name: z.string().trim().min(1).max(191), serviceId: z.coerce.number().int().positive().optional() })).min(1).max(80).optional(),
});

export const PATCH = apiRoute("labtest:manage", async (request, { params }) => {
  const { id } = await params;
  const pid = BigInt(id);
  const existing = await tenantDb.lab_panels.findUnique({ where: { id: pid } });
  if (!existing) return json({ error: "not_found" }, 404);
  const b = await parseBody(request, patchSchema);
  await tenantDb.$transaction(async (tx) => {
    await tx.lab_panels.update({
      where: { id: pid },
      data: {
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.sampleType !== undefined ? { sample_type: b.sampleType || null } : {}),
        ...(b.active !== undefined ? { active: b.active } : {}),
      },
    });
    if (b.tests) {
      await tx.lab_panel_items.deleteMany({ where: { panel_id: pid } });
      const seen = new Set();
      let order = 0;
      for (const t of b.tests) {
        if (seen.has(t.name.toLowerCase())) continue;
        seen.add(t.name.toLowerCase());
        await tx.lab_panel_items.create({ data: { panel_id: pid, test_name: t.name, service_id: t.serviceId ? BigInt(t.serviceId) : null, sort_order: order++ } });
      }
    }
  });
  const all = await loadPanels(tenantDb);
  return json({ panel: all.find((p) => p.id === Number(pid)) });
});
