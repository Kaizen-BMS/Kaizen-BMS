import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { changeTariff } from "@/lib/pricing";
import { testSchema, loadCatalog } from "@/lib/labCatalog";

export const dynamic = "force-dynamic";

// The lab's own list of tests (with prices) — what it offers.
export const GET = apiRoute("lab:read", async () => json({ tests: await loadCatalog(tenantDb) }));

export const POST = apiRoute("labtest:manage", async (request, { session }) => {
  const b = await parseBody(request, testSchema);
  const uid = BigInt(session.userId);
  const created = await tenantDb.$transaction(async (tx) => {
    const n = (await tx.services.count({ where: { service_type: "LAB" } })) + 1;
    let code = `LAB-${String(n).padStart(3, "0")}`;
    while (await tx.services.findFirst({ where: { code } })) code = `LAB-${String(Number(code.slice(4)) + 1).padStart(3, "0")}`;
    const service = await tx.services.create({ data: { code, name: b.name, category: "Lab test", service_type: "LAB", created_by: uid, updated_by: uid } });
    const half = b.gst / 2;
    await changeTariff(tx, { serviceId: Number(service.id), price: b.price, cgstRate: half, sgstRate: half, reason: "Lab test created" }, uid);
    return tx.lab_tests.create({
      data: { service_id: service.id, sample_type: b.sampleType || null, units: b.units || null, reference_range: b.referenceRange || null, turnaround_hours: b.turnaroundHours ?? null, instructions: b.instructions || null },
    });
  });
  const all = await loadCatalog(tenantDb);
  return json({ test: all.find((t) => t.id === Number(created.id)) }, 201);
});
