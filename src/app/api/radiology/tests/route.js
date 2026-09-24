import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { changeTariff } from "@/lib/pricing";
import { studySchema, loadStudies } from "@/lib/radiologyCatalog";

export const dynamic = "force-dynamic";

// The imaging department's own list of studies (with prices) — what it offers.
export const GET = apiRoute("radiology:read", async () => json({ studies: await loadStudies(tenantDb) }));

export const POST = apiRoute("radiology:manage", async (request, { session }) => {
  const b = await parseBody(request, studySchema);
  const uid = BigInt(session.userId);
  const created = await tenantDb.$transaction(async (tx) => {
    const n = (await tx.services.count({ where: { service_type: "RADIOLOGY" } })) + 1;
    let code = `RAD-${String(n).padStart(3, "0")}`;
    while (await tx.services.findFirst({ where: { code } })) code = `RAD-${String(Number(code.slice(4)) + 1).padStart(3, "0")}`;
    const service = await tx.services.create({ data: { code, name: b.name, category: b.modality, service_type: "RADIOLOGY", created_by: uid, updated_by: uid } });
    const half = b.gst / 2;
    await changeTariff(tx, { serviceId: Number(service.id), price: b.price, cgstRate: half, sgstRate: half, reason: "Study created" }, uid);
    return tx.radiology_tests.create({
      data: {
        service_id: service.id,
        modality: b.modality,
        body_part: b.bodyPart || null,
        contrast_option: b.contrastOption,
        preparation: b.preparation || null,
        turnaround_hours: b.turnaroundHours ?? null,
      },
    });
  });
  const all = await loadStudies(tenantDb);
  return json({ study: all.find((t) => t.id === Number(created.id)) }, 201);
});
