import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { validateCustomFields } from "@/lib/forms";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Each test is still just a name for display (`lab_orders.tests`, unchanged
// shape/column) — `serviceId` is an optional, explicit, additional link to
// a LAB-type Service Master entry (Phase 7 — CLAUDE.md "Pricing / Tariff —
// lab integration"), never inferred from the name text at billing time. A
// plain string item (every pre-Phase-7 caller) is accepted exactly as
// before and creates no service mapping at all.
const testSchema = z.union([
  z.string().trim().min(1).max(191).transform((name) => ({ name, serviceId: undefined })),
  z.object({
    name: z.string().trim().min(1).max(191),
    serviceId: z.coerce.number().int().positive().optional(),
  }),
]);

const createSchema = z.object({
  tests: z.array(testSchema).min(1).max(50),
  notes: z.string().trim().max(500).optional().default(""),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const POST = apiRoute("laborder:create", async (request, ctx) => {
  const { session } = ctx;
  const { id } = await ctx.params;
  const consultationId = BigInt(id);
  const body = await parseBody(request, createSchema);

  const consultation = await tenantDb.consultations.findUnique({
    where: { id: consultationId },
    select: { id: true, visit_id: true, patient_id: true },
  });
  if (!consultation) return json({ error: "consultation_not_found" }, 404);

  const custom = await validateCustomFields(
    session.tenantId,
    "LAB_ORDER",
    body.customFields,
  );

  const testNames = body.tests.map((t) => t.name);
  const mapped = body.tests.filter((t) => t.serviceId != null);

  const created = await tenantDb.$transaction(async (tx) => {
    const order = await tx.lab_orders.create({
      data: {
        visit_id: consultation.visit_id,
        consultation_id: consultation.id,
        patient_id: consultation.patient_id,
        tests: JSON.stringify(testNames),
        custom_fields: custom ? JSON.stringify(custom) : null,
        status: "ORDERED",
        ordered_by: BigInt(session.userId),
      },
    });
    for (const t of mapped) {
      await tx.lab_order_items.create({
        data: { lab_order_id: order.id, service_id: t.serviceId, test_name: t.name },
      });
    }
    return order;
  });

  const withPatient = await tenantDb.lab_orders.findUnique({
    where: { id: created.id },
    include: { patients: { select: { name: true } } },
  });
  const { patients: p, ...rest } = withPatient;
  const labOrder = { ...rest, patient_name: p.name };

  // Routes to the Lab sub-room live, in this same request cycle.
  emitToModule(session.tenantId, "LAB", "laborder:created", { labOrder });

  return json({ labOrder }, 201);
});
