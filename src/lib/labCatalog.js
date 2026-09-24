import { z } from "zod";

export const testSchema = z.object({
  name: z.string().trim().min(1).max(200),
  price: z.coerce.number().min(0).max(1_000_000),
  gst: z.coerce.number().min(0).max(28).optional().default(0),
  sampleType: z.string().trim().max(60).optional().or(z.literal("")),
  units: z.string().trim().max(64).optional().or(z.literal("")),
  referenceRange: z.string().trim().max(191).optional().or(z.literal("")),
  turnaroundHours: z.coerce.number().int().min(0).max(2000).optional(),
  instructions: z.string().trim().max(255).optional().or(z.literal("")),
});

export function serializeTest(t, service, tariff) {
  return {
    id: Number(t.id),
    serviceId: Number(t.service_id),
    name: service?.name ?? "",
    code: service?.code ?? "",
    active: service ? !!service.active : true,
    price: tariff ? Number(tariff.price) : null,
    gst: tariff ? Number(tariff.cgst_rate) + Number(tariff.sgst_rate) + Number(tariff.igst_rate) : 0,
    sampleType: t.sample_type,
    units: t.units,
    referenceRange: t.reference_range,
    turnaroundHours: t.turnaround_hours,
    instructions: t.instructions,
  };
}

/** The whole catalogue with current prices, in three queries (no N+1). */
export async function loadCatalog(db, { onlyActive = false, tenantId } = {}) {
  // tenantId is only passed with the raw (unscoped) client — e.g. reading a connected partner lab's own list.
  const scope = tenantId != null ? { tenant_id: BigInt(tenantId) } : {};
  const tests = await db.lab_tests.findMany({ where: scope, orderBy: { id: "asc" } });
  if (!tests.length) return [];
  const ids = tests.map((t) => t.service_id);
  const [services, tariffs] = await Promise.all([
    db.services.findMany({ where: { id: { in: ids }, ...scope } }),
    db.tariffs.findMany({ where: { service_id: { in: ids }, ...scope, patient_category: "SELF_PAY", active: true, effective_to: null } }),
  ]);
  const sm = new Map(services.map((s) => [String(s.id), s]));
  const tm = new Map(tariffs.map((t) => [String(t.service_id), t]));
  return tests
    .map((t) => serializeTest(t, sm.get(String(t.service_id)), tm.get(String(t.service_id))))
    .filter((t) => !onlyActive || t.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Test sets / panels with their component tests ("CBC Panel" = Hemoglobin + RBC + ...). */
export async function loadPanels(db, { onlyActive = false, tenantId } = {}) {
  const scope = tenantId != null ? { tenant_id: BigInt(tenantId) } : {};
  const panels = await db.lab_panels.findMany({ where: { ...scope, ...(onlyActive ? { active: true } : {}) }, orderBy: { name: "asc" } });
  if (!panels.length) return [];
  const items = await db.lab_panel_items.findMany({ where: { panel_id: { in: panels.map((p) => p.id) } }, orderBy: [{ sort_order: "asc" }, { id: "asc" }] });
  return panels.map((p) => ({
    id: Number(p.id),
    name: p.name,
    sampleType: p.sample_type,
    active: !!p.active,
    tests: items.filter((i) => i.panel_id === p.id).map((i) => ({ name: i.test_name, serviceId: i.service_id != null ? Number(i.service_id) : null })),
  }));
}
