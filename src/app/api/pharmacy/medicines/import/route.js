import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { medicineInputSchema, toRow } from "@/lib/medicineCatalog";
import { parseUploadedWorkbook } from "@/lib/medicineExcel";

export const dynamic = "force-dynamic";

const MAX_ROWS = 2000;

// Bulk-creates medicines from an uploaded .xlsx (see
// GET .../import/template for the expected shape). Every row goes through
// the EXACT same medicineInputSchema + toRow() the single "Add Medicine"
// form uses — never a second, looser validation path — and the same
// duplicate-name rule (skip, don't error the whole batch). Never touches
// pharmacy_stock/batches — this is catalog-only, exactly like the single
// create route.
export const POST = apiRoute("medicine:manage", async (request, { session }) => {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "file_required");

  const buffer = Buffer.from(await file.arrayBuffer());
  let rawRows;
  try {
    rawRows = await parseUploadedWorkbook(buffer);
  } catch {
    throw new HttpError(400, "could_not_read_file");
  }
  if (rawRows.length === 0) throw new HttpError(400, "no_rows_found");
  if (rawRows.length > MAX_ROWS) throw new HttpError(400, `too_many_rows_max_${MAX_ROWS}`);

  const uid = BigInt(session.userId);
  const existing = await tenantDb.medicines.findMany({ select: { name: true, barcode: true } });
  const existingNames = new Set(existing.map((m) => m.name.toLowerCase()));
  const existingBarcodes = new Set(existing.filter((m) => m.barcode).map((m) => m.barcode));

  const created = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < rawRows.length; i++) {
    const excelRow = i + 2; // row 1 is the header
    // An empty "Medicine Name*" cell reads as "" from the sheet, not
    // undefined — check it directly first so a blank name reports the
    // same clean "medicine_name_required" message the single Add Medicine
    // form uses, instead of a raw zod min-length error.
    if (!rawRows[i].baseName) {
      errors.push({ row: excelRow, error: "medicine_name_required" });
      continue;
    }
    const parsed = medicineInputSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      errors.push({ row: excelRow, error: parsed.error.issues[0]?.message || "invalid_row" });
      continue;
    }
    const body = parsed.data;
    if (!body.baseName) {
      errors.push({ row: excelRow, error: "medicine_name_required" });
      continue;
    }
    const row = toRow(body, uid);
    if (existingNames.has(row.name.toLowerCase())) {
      skipped.push({ row: excelRow, name: row.name, reason: "already_exists" });
      continue;
    }
    if (row.barcode && existingBarcodes.has(row.barcode)) {
      skipped.push({ row: excelRow, name: row.name, reason: "barcode_already_used" });
      continue;
    }
    created.push({ ...row, created_by: uid });
    // Reserve the name/barcode immediately so two rows in the SAME file
    // with the same name don't both get created as duplicates.
    existingNames.add(row.name.toLowerCase());
    if (row.barcode) existingBarcodes.add(row.barcode);
  }

  if (created.length > 0) {
    await tenantDb.medicines.createMany({ data: created });
  }

  return json({
    createdCount: created.length,
    skipped,
    errors,
  }, 201);
});
