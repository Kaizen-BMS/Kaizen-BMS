import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { loadPanels } from "@/lib/labCatalog";

export const dynamic = "force-dynamic";

export const panelSchema = z.object({
  name: z.string().trim().min(1).max(150),
  sampleType: z.string().trim().max(60).optional().or(z.literal("")),
  tests: z.array(z.object({ name: z.string().trim().min(1).max(191), serviceId: z.coerce.number().int().positive().optional() })).min(1).max(80),
});

// A lab's own test sets — "CBC Panel", "Liver Function Test" — each a named list of component tests.
export const GET = apiRoute("lab:read", async () => json({ panels: await loadPanels(tenantDb) }));

export const POST = apiRoute("labtest:manage", async (request) => {
  const b = await parseBody(request, panelSchema);
  if (await tenantDb.lab_panels.findFirst({ where: { name: b.name }, select: { id: true } })) throw new HttpError(409, "panel_already_exists");
  const seen = new Set();
  const tests = b.tests.filter((t) => (seen.has(t.name.toLowerCase()) ? false : (seen.add(t.name.toLowerCase()), true)));
  const created = await tenantDb.$transaction(async (tx) => {
    const p = await tx.lab_panels.create({ data: { name: b.name, sample_type: b.sampleType || null } });
    let order = 0;
    for (const t of tests) {
      await tx.lab_panel_items.create({ data: { panel_id: p.id, test_name: t.name, service_id: t.serviceId ? BigInt(t.serviceId) : null, sort_order: order++ } });
    }
    return p;
  });
  const all = await loadPanels(tenantDb);
  return json({ panel: all.find((p) => p.id === Number(created.id)) }, 201);
});
