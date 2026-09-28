import { apiRoute } from "@/lib/apiRoute";
import { buildTemplateWorkbook } from "@/lib/medicineExcel";

export const dynamic = "force-dynamic";

// A ready-to-fill .xlsx: header row + one example row on "Medicines", plus
// a "Reference" sheet listing the allowed Type/Schedule values — so a
// pharmacist building the list offline knows exactly what's accepted
// before uploading it back via POST /api/pharmacy/medicines/import.
export const GET = apiRoute("medicine:manage", async () => {
  const wb = await buildTemplateWorkbook();
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=medicine-import-template.xlsx",
    },
  });
});
