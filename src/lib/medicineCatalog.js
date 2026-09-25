"use strict";

const { z } = require("zod");
const { MEDICINE_TYPES, SCHEDULES } = require("./medicineTypes");
const { composeMedicineName } = require("./medicineName");

const opt = (n) => z.string().trim().max(n).optional().or(z.literal(""));

const medicineInputSchema = z.object({
  // Either the bare name (composed into "Cap Betadine 500 mg" server-side) or, for older callers, the full name.
  name: z.string().trim().min(1).max(191).optional(),
  baseName: z.string().trim().min(1).max(191).optional(),
  genericName: opt(191),
  brandName: opt(191),
  medicineType: z.enum(MEDICINE_TYPES).optional().default("Other"),
  strength: opt(60),
  dosageForm: opt(60),
  manufacturer: opt(191),
  composition: opt(255),
  category: opt(100),
  schedule: z.enum(SCHEDULES).optional().or(z.literal("")),
  prescriptionRequired: z.coerce.boolean().optional().default(false),
  barcode: opt(64),
  hsnCode: opt(20),
  gstRate: z.coerce.number().min(0).max(28).optional().default(0),
  packSize: opt(60),
  unit: opt(30),
  purchaseUnit: opt(30),
  unitsPerPurchase: z.coerce.number().int().min(1).max(100000).optional().default(1),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).optional().default(10),
  maxStock: z.coerce.number().int().min(0).max(10_000_000).optional(),
  rack: opt(20),
  shelf: opt(20),
  bin: opt(20),
});

const medicineUpdateSchema = medicineInputSchema.partial().extend({
  active: z.coerce.boolean().optional(),
});

function serializeMedicine(m) {
  if (!m) return null;
  return {
    id: Number(m.id),
    name: m.name,
    baseName: m.base_name || m.name,
    genericName: m.generic_name,
    brandName: m.brand_name,
    medicineType: m.medicine_type,
    strength: m.strength,
    dosageForm: m.dosage_form,
    manufacturer: m.manufacturer,
    composition: m.composition,
    category: m.category,
    schedule: m.schedule,
    prescriptionRequired: !!m.prescription_required,
    barcode: m.barcode,
    hsnCode: m.hsn_code,
    gstRate: Number(m.gst_rate || 0),
    packSize: m.pack_size,
    unit: m.unit,
    purchaseUnit: m.purchase_unit,
    unitsPerPurchase: m.units_per_purchase ?? 1,
    reorderLevel: m.reorder_level,
    maxStock: m.max_stock,
    rack: m.rack,
    shelf: m.shelf,
    bin: m.bin,
    active: !!m.active,
    createdAt: m.created_at,
  };
}

function toRow(v, userId) {
  const base = v.baseName || v.name;
  return {
    name: v.baseName ? composeMedicineName(v.medicineType, v.baseName, v.strength) : v.name,
    base_name: base,
    generic_name: v.genericName || null,
    brand_name: v.brandName || null,
    medicine_type: v.medicineType || "Other",
    strength: v.strength || null,
    dosage_form: v.dosageForm || null,
    manufacturer: v.manufacturer || null,
    composition: v.composition || null,
    category: v.category || null,
    schedule: v.schedule || null,
    prescription_required: !!v.prescriptionRequired,
    barcode: v.barcode || null,
    hsn_code: v.hsnCode || null,
    gst_rate: v.gstRate ?? 0,
    pack_size: v.packSize || null,
    unit: v.unit || null,
    purchase_unit: v.purchaseUnit || null,
    units_per_purchase: v.purchaseUnit ? v.unitsPerPurchase ?? 1 : 1,
    reorder_level: v.reorderLevel ?? 10,
    max_stock: v.maxStock ?? null,
    rack: v.rack || null,
    shelf: v.shelf || null,
    bin: v.bin || null,
    ...(userId ? { updated_by: userId } : {}),
  };
}

module.exports = {
  composeMedicineName,
  medicineInputSchema,
  medicineUpdateSchema,
  serializeMedicine,
  toRow,
};
