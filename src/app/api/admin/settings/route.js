import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

export const GET = apiRoute("formtemplate:manage", async (request, { session }) => {
  const t = await prisma.tenants.findUnique({ where: { id: BigInt(session.tenantId) }, select: { name: true, type: true, public_code: true, show_stock_to_doctors: true } });
  const mods = await prisma.tenant_modules.findMany({ where: { tenant_id: BigInt(session.tenantId), is_active: true }, select: { module_name: true } });
  return json({ name: t.name, type: t.type, publicCode: t.public_code, showStockToDoctors: !!t.show_stock_to_doctors, hasPharmacy: mods.some((m) => m.module_name === "PHARMACY") });
});

const schema = z.object({ showStockToDoctors: z.boolean() });

export const PATCH = apiRoute("formtemplate:manage", async (request, { session }) => {
  const { showStockToDoctors } = await parseBody(request, schema);
  await prisma.tenants.update({ where: { id: BigInt(session.tenantId) }, data: { show_stock_to_doctors: showStockToDoctors } });
  return json({ ok: true, showStockToDoctors });
});
