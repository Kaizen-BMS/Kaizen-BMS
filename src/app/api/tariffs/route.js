import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { tariffInputSchema, serializeTariff, changeTariff, PATIENT_CATEGORIES } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  serviceId: z.coerce.number().int().positive().optional(),
  patientCategory: z.enum(PATIENT_CATEGORIES).optional(),
  currentOnly: z.enum(["true", "false"]).optional(),
});

// Tariff Master — GET doubles as both "current price list" and "pricing
// history" (CLAUDE.md "Pricing / Tariff — admin UI"): with ?serviceId=,
// every version for that service is returned (current first, via the
// `current` flag each row already carries), sorted newest-first. Without
// it, only each service's single currently-open tariff is returned (the
// price-list view).
export const GET = apiRoute("tariff:read", async (request) => {
  const { searchParams } = new URL(request.url);
  const q = listQuerySchema.parse(Object.fromEntries(searchParams));

  const where = {};
  if (q.serviceId) where.service_id = BigInt(q.serviceId);
  if (q.patientCategory) where.patient_category = q.patientCategory;
  if (!q.serviceId || q.currentOnly === "true") {
    where.active = true;
    where.effective_to = null;
  }

  const rows = await tenantDb.tariffs.findMany({
    where,
    orderBy: [{ service_id: "asc" }, { effective_from: "desc" }],
    include: { services: { select: { code: true, name: true, service_type: true } } },
  });

  return json({
    tariffs: rows.map((r) => ({
      ...serializeTariff(r),
      serviceCode: r.services.code,
      serviceName: r.services.name,
      serviceType: r.services.service_type,
    })),
  });
});

// Creating a tariff VERSIONS the price (closes whatever was previously
// open for the same service+category) rather than editing in place — see
// src/lib/pricing.js's changeTariff() and migration 027's own comment.
export const POST = apiRoute("tariff:manage", async (request, { session }) => {
  const body = await parseBody(request, tariffInputSchema);

  let created;
  try {
    created = await tenantDb.$transaction(async (tx) => changeTariff(tx, body, BigInt(session.userId)));
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }

  const full = await tenantDb.tariffs.findUnique({ where: { id: created.id }, include: { services: true } });
  emitToModule(session.tenantId, "BILLING", "tariff:created", { tariff: serializeTariff(full) });
  return json({ tariff: serializeTariff(full) }, 201);
});
