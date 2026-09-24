import { z } from "zod";

export const MODALITIES = ["X-Ray", "CT", "MRI", "Ultrasound", "Mammography", "Fluoroscopy", "Other"];
export const CONTRAST_OPTIONS = ["NONE", "OPTIONAL", "REQUIRED"];

export const studySchema = z.object({
  name: z.string().trim().min(1).max(200),
  modality: z.enum(MODALITIES),
  bodyPart: z.string().trim().max(80).optional().or(z.literal("")),
  price: z.coerce.number().min(0).max(1_000_000),
  gst: z.coerce.number().min(0).max(28).optional().default(0),
  contrastOption: z.enum(CONTRAST_OPTIONS).optional().default("NONE"),
  preparation: z.string().trim().max(500).optional().or(z.literal("")),
  turnaroundHours: z.coerce.number().int().min(0).max(2000).optional(),
});

export function serializeStudy(t, service, tariff) {
  return {
    id: Number(t.id),
    serviceId: Number(t.service_id),
    name: service?.name ?? "",
    active: service ? !!service.active : true,
    modality: t.modality,
    bodyPart: t.body_part,
    contrastOption: t.contrast_option,
    preparation: t.preparation,
    turnaroundHours: t.turnaround_hours,
    price: tariff ? Number(tariff.price) : null,
    gst: tariff ? Number(tariff.cgst_rate) + Number(tariff.sgst_rate) + Number(tariff.igst_rate) : 0,
  };
}

/** The imaging catalogue with current prices, in three queries. */
export async function loadStudies(db, { onlyActive = false } = {}) {
  const tests = await db.radiology_tests.findMany({ orderBy: { id: "asc" } });
  if (!tests.length) return [];
  const ids = tests.map((t) => t.service_id);
  const [services, tariffs] = await Promise.all([
    db.services.findMany({ where: { id: { in: ids } } }),
    db.tariffs.findMany({ where: { service_id: { in: ids }, patient_category: "SELF_PAY", active: true, effective_to: null } }),
  ]);
  const sm = new Map(services.map((s) => [String(s.id), s]));
  const tm = new Map(tariffs.map((t) => [String(t.service_id), t]));
  return tests
    .map((t) => serializeStudy(t, sm.get(String(t.service_id)), tm.get(String(t.service_id))))
    .filter((t) => !onlyActive || t.active)
    .sort((a, b) => a.modality.localeCompare(b.modality) || a.name.localeCompare(b.name));
}

export async function loadStudySets(db, { onlyActive = false } = {}) {
  const panels = await db.radiology_panels.findMany({ where: onlyActive ? { active: true } : {}, orderBy: { name: "asc" } });
  if (!panels.length) return [];
  const items = await db.radiology_panel_items.findMany({ where: { panel_id: { in: panels.map((p) => p.id) } }, orderBy: [{ sort_order: "asc" }, { id: "asc" }] });
  return panels.map((p) => ({
    id: Number(p.id),
    name: p.name,
    modality: p.modality,
    active: !!p.active,
    studies: items.filter((i) => i.panel_id === p.id).map((i) => ({ name: i.study_name, serviceId: i.service_id != null ? Number(i.service_id) : null })),
  }));
}
