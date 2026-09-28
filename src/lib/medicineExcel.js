"use strict";

// Bulk medicine import via Excel — a pharmacist builds the medicine list in
// a spreadsheet (offline, at their own pace, in a tool they already know)
// instead of clicking "Add Medicine" one at a time. The template and the
// import share this ONE column list so they can never drift apart.
const ExcelJS = require("exceljs");
const { MEDICINE_TYPES, SCHEDULES } = require("./medicineTypes");

// [excel header, internal field key, example value]
const COLUMNS = [
  ["Medicine Name*", "baseName", "Betadine"],
  ["Type", "medicineType", "Cream"],
  ["Strength", "strength", "500mg"],
  ["Generic / Salt", "genericName", "Povidone Iodine"],
  ["Brand", "brandName", "Betadine"],
  ["Composition", "composition", "Povidone Iodine 5% w/w"],
  ["Manufacturer", "manufacturer", "ABC Pharma"],
  ["Category", "category", "Antiseptic"],
  ["Schedule", "schedule", "OTC"],
  ["Prescription Required (Yes/No)", "prescriptionRequired", "No"],
  ["Barcode", "barcode", ""],
  ["HSN Code", "hsnCode", ""],
  ["GST Rate %", "gstRate", "0"],
  ["Sold/Stocked As (unit)", "unit", "Tube"],
  ["Content Unit", "contentUnit", "gm"],
  ["Content Per Pack", "contentPerPack", "20"],
  ["Bought As (purchase unit)", "purchaseUnit", "Box"],
  ["Units Per Purchase", "unitsPerPurchase", "10"],
  ["Reorder Level", "reorderLevel", "10"],
  ["Max Stock", "maxStock", ""],
  ["Location", "rack", "Rack A - Shelf 3"],
];

async function buildTemplateWorkbook() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Medicines");
  sheet.columns = COLUMNS.map(([header]) => ({ header, width: Math.max(14, header.length + 2) }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(COLUMNS.map(([, , example]) => example));
  sheet.getRow(2).font = { italic: true, color: { argb: "FF888888" } };

  const help = wb.addWorksheet("Reference");
  help.columns = [{ header: "Allowed medicine types", width: 24 }, { header: "Allowed schedules", width: 20 }];
  help.getRow(1).font = { bold: true };
  const maxLen = Math.max(MEDICINE_TYPES.length, SCHEDULES.length);
  for (let i = 0; i < maxLen; i++) help.addRow([MEDICINE_TYPES[i] || "", SCHEDULES[i] || ""]);

  return wb;
}

// One row from the sheet -> the same shape medicineInputSchema expects.
// Only "Medicine Name*" is required; everything else is optional, matching
// the single "Add Medicine" form's own rules exactly (see medicineCatalog.js).
function rowToInput(cells) {
  const get = (key) => {
    const idx = COLUMNS.findIndex(([, k]) => k === key);
    const v = cells[idx];
    return v == null ? "" : String(v).trim();
  };
  const yesNo = (v) => /^y(es)?$/i.test(v.trim());
  const num = (v) => (v.trim() === "" ? undefined : Number(v));
  return {
    baseName: get("baseName"),
    medicineType: MEDICINE_TYPES.includes(get("medicineType")) ? get("medicineType") : "Other",
    strength: get("strength"),
    genericName: get("genericName"),
    brandName: get("brandName"),
    composition: get("composition"),
    manufacturer: get("manufacturer"),
    category: get("category"),
    schedule: SCHEDULES.includes(get("schedule")) ? get("schedule") : "",
    prescriptionRequired: yesNo(get("prescriptionRequired")),
    barcode: get("barcode"),
    hsnCode: get("hsnCode"),
    gstRate: num(get("gstRate")) ?? 0,
    unit: get("unit"),
    contentUnit: get("contentUnit"),
    contentPerPack: num(get("contentPerPack")),
    purchaseUnit: get("purchaseUnit"),
    unitsPerPurchase: num(get("unitsPerPurchase")) ?? 1,
    reorderLevel: num(get("reorderLevel")) ?? 10,
    maxStock: num(get("maxStock")),
    rack: get("rack"),
  };
}

// Reads every data row (from row 2 onward — row 1 is the header) of the
// FIRST worksheet in an uploaded workbook, in the exact COLUMNS order.
async function parseUploadedWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const cells = COLUMNS.map((_, i) => {
      const cell = row.getCell(i + 1);
      return cell.value == null ? "" : cell.value;
    });
    if (cells.every((c) => String(c).trim() === "")) return; // blank row
    rows.push(rowToInput(cells));
  });
  return rows;
}

module.exports = { COLUMNS, buildTemplateWorkbook, parseUploadedWorkbook };
