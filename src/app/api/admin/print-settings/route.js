import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { merge, PAPERS } from "@/lib/printSettings";
import { PRESETS, TOKENS } from "@/lib/printLayout";
import { resolveBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

export const GET = apiRoute("formtemplate:manage", async (request, { session }) => {
  const t = await prisma.tenants.findUnique({ where: { id: BigInt(session.tenantId) }, select: { print_settings: true, name: true } });
  const b = await resolveBranding(session.tenantId, null);
  return json({
    settings: merge(t?.print_settings),
    presets: Object.fromEntries(Object.entries(PRESETS).map(([k, g]) => [k, Object.entries(g).map(([key, p]) => ({ key, label: p.label }))])),
    tokens: TOKENS,
    papers: Object.entries(PAPERS).map(([key, p]) => ({ key, label: p.label })),
    branding: { name: b.header.header_name || t?.name, logo: b.header.logo_url || null, address: b.header.address || null, phone: b.header.phone || null },
  });
});

const paper = z.enum(Object.keys(PAPERS));
const schema = z.object({
  slip: z.object({
    enabled: z.boolean(), autoPrint: z.boolean(), paper, title: z.string().trim().max(60),
    showToken: z.boolean(), showAge: z.boolean(), showGender: z.boolean(), showPhone: z.boolean(),
    showReason: z.boolean(), showFee: z.boolean(), showDateTime: z.boolean(), footer: z.string().trim().max(200), layout: z.any().optional(),
  }),
  invoice: z.object({ paper, showGstin: z.boolean(), layout: z.any().optional() }),
});

export const PUT = apiRoute("formtemplate:manage", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const clean = merge(body);
  await prisma.tenants.update({ where: { id: BigInt(session.tenantId) }, data: { print_settings: JSON.stringify(clean) } });
  return json({ ok: true, settings: clean });
});
