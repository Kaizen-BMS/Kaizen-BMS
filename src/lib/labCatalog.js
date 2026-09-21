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
export async function loadCatalog(db, { onlyActive = false } = {}) {
  const tests = await db.lab_tests.findMany({ orderBy: { id: "asc" } });
  if (!tests.length) return [];
  const ids = tests.map((t) => t.service_id);
  const [services, tariffs] = await Promise.all([
    db.services.findMany({ where: { id: { in: ids } } }),
    db.tariffs.findMany({ where: { service_id: { in: ids }, patient_category: "SELF_PAY", active: true, effective_to: null } }),
  ]);
  const sm = new Map(services.map((s) => [String(s.id), s]));
  const tm = new Map(tariffs.map((t) => [String(t.service_id), t]));
  return tests
    .map((t) => serializeTest(t, sm.get(String(t.service_id)), tm.get(String(t.service_id))))
    .filter((t) => !onlyActive || t.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}
