import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { serviceInputSchema, serializeService, SERVICE_TYPES } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  serviceType: z.enum(SERVICE_TYPES).optional(),
  active: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});

// Service Master (CLAUDE.md "Pricing / Tariff"). Read is available to
// billing staff (they browse the price list while billing); only
// service:manage (HOSPITAL_ADMIN wildcard) can create/edit.
export const GET = apiRoute("service:read", async (request) => {
  const { searchParams } = new URL(request.url);
  const q = listQuerySchema.parse(Object.fromEntries(searchParams));

  const where = {};
  if (q.serviceType) where.service_type = q.serviceType;
  if (q.active != null) where.active = q.active === "true";
  if (q.search) {
    where.OR = [
      { name: { contains: q.search } },
      { code: { contains: q.search } },
    ];
  }

  const [total, rows] = await Promise.all([
    tenantDb.services.count({ where }),
    tenantDb.services.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return json({ services: rows.map(serializeService), total, page: q.page, pageSize: q.pageSize });
});

export const POST = apiRoute("service:manage", async (request, { session }) => {
  const body = await parseBody(request, serviceInputSchema);

  const existing = await tenantDb.services.findFirst({ where: { code: body.code } });
  if (existing) return json({ error: "code_already_in_use" }, 409);

  const created = await tenantDb.services.create({
    data: {
      code: body.code,
      name: body.name,
      description: body.description || null,
      category: body.category || null,
      service_type: body.serviceType,
      created_by: BigInt(session.userId),
      updated_by: BigInt(session.userId),
    },
  });

  emitToModule(session.tenantId, "BILLING", "service:created", { service: serializeService(created) });
  return json({ service: serializeService(created) }, 201);
});
