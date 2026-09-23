import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { resolveInstance } from "@/lib/moduleInstances";
import { computeMedicineAlerts } from "@/lib/pharmacyAlerts";
import { EXPIRY_WARNING_DAYS } from "@/lib/pharmacyConstants";

export const dynamic = "force-dynamic";

function rowStatus(quantity, expired, expiringSoon, lowStock) {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (expired) return "EXPIRED";
  if (expiringSoon) return "EXPIRY_SOON";
  if (lowStock) return "LOW_STOCK";
  return "IN_STOCK";
}

// Batch-wise stock, grouped by medicine (unchanged `medicines` shape — the
// Alerts Center and Dashboard widget both still read it as-is), PLUS a
// compact one-row-per-batch table with every field a pharmacist needs
// without opening another screen: type, strength, batch, expiry, stock,
// MRP, purchase rate, rack, status. Optional ?moduleInstanceId= scopes to
// one Pharmacy instance; omitted resolves to the tenant's default one.
// ?q= / ?type= / ?status= / ?rack= narrow the row table server-side.
export const GET = apiRoute("stock:read", async (request, { session }) => {
  const { searchParams } = new URL(request.url);
  const instanceParam = searchParams.get("moduleInstanceId");
  const instance = await resolveInstance(tenantDb, session.tenantId, "PHARMACY", instanceParam);

  const [batches, thresholds] = await Promise.all([
    tenantDb.pharmacy_stock.findMany({
      where: { module_instance_id: instance.id },
      orderBy: [{ medicine_name: "asc" }, { expiry_date: "asc" }, { id: "asc" }],
    }),
    tenantDb.pharmacy_thresholds.findMany(),
  ]);

  const medicineIds = [...new Set(batches.map((b) => b.medicine_id).filter(Boolean))];
  const medicines_master = medicineIds.length ? await tenantDb.medicines.findMany({ where: { id: { in: medicineIds } } }) : [];
  const mById = new Map(medicines_master.map((m) => [String(m.id), m]));
  const thresholdMap = new Map(thresholds.map((t) => [t.medicine_name, t]));

  const medicines = computeMedicineAlerts(batches, thresholds);
  const lowByName = new Set(medicines.filter((m) => m.lowStock).map((m) => m.medicineName));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const warnBy = new Date();
  warnBy.setDate(warnBy.getDate() + EXPIRY_WARNING_DAYS);

  let rows = batches.map((b) => {
    const master = b.medicine_id ? mById.get(String(b.medicine_id)) : null;
    const expiry = b.expiry_date ? new Date(b.expiry_date) : null;
    const expired = !!expiry && expiry < today;
    const expiringSoon = !!expiry && expiry >= today && expiry <= warnBy;
    const lowStock = lowByName.has(b.medicine_name);
    return {
      stockId: Number(b.id),
      medicineId: master ? Number(master.id) : null,
      medicineName: b.medicine_name,
      type: master?.medicine_type || "Other",
      strength: master?.strength || null,
      genericName: master?.generic_name || null,
      brandName: master?.brand_name || null,
      manufacturer: master?.manufacturer || null,
      category: master?.category || null,
      schedule: master?.schedule || null,
      barcode: master?.barcode || null,
      hsnCode: master?.hsn_code || null,
      unit: master?.unit || null,
      batchNumber: b.batch_number,
      manufacturingDate: b.manufacturing_date,
      expiryDate: b.expiry_date,
      quantity: b.quantity,
      purchaseRate: b.purchase_rate != null ? Number(b.purchase_rate) : null,
      mrp: b.mrp != null ? Number(b.mrp) : null,
      sellingRate: b.selling_rate != null ? Number(b.selling_rate) : null,
      rack: b.rack || master?.rack || null,
      shelf: b.shelf || master?.shelf || null,
      bin: b.bin || master?.bin || null,
      reorderLevel: thresholdMap.get(b.medicine_name)?.low_stock_threshold ?? master?.reorder_level ?? 10,
      expired,
      expiringSoon,
      lowStock,
      status: rowStatus(b.quantity, expired, expiringSoon, lowStock),
    };
  });

  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const type = searchParams.get("type");
  const status = searchParams.get("status") || searchParams.get("filter"); // filter=low|expiring|expired|out|in (dashboard/alert links)
  const rack = searchParams.get("rack");

  if (q) {
    rows = rows.filter((r) =>
      [r.medicineName, r.genericName, r.brandName, r.batchNumber, r.barcode, r.manufacturer, r.rack]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }
  if (type) rows = rows.filter((r) => r.type === type);
  if (rack) rows = rows.filter((r) => r.rack === rack);
  if (status) {
    const key = { low: "LOW_STOCK", expiring: "EXPIRY_SOON", expired: "EXPIRED", out: "OUT_OF_STOCK", in: "IN_STOCK" }[status] || status.toUpperCase();
    rows = rows.filter((r) => (key === "LOW_STOCK" ? r.lowStock : key === "EXPIRY_SOON" ? r.expiringSoon && !r.expired : key === "EXPIRED" ? r.expired : r.status === key));
  }

  return json({ medicines, rows, instance: { id: Number(instance.id), name: instance.name } });
});
