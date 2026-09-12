import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const TYPES = ["RMP", "LOCAL_DOCTOR", "CAMP", "INSURANCE", "HEALTH_CARD", "OTHER"];

// Tenant-managed master data, same philosophy as form_templates — the
// category (`type`) is the only thing code-defined; the actual list of
// doctors/camps/insurers is whatever this tenant has added, no hardcoding.
// Gated on `patient:create` (not a separate read action): anyone who can
// register a patient needs to see this list to populate the dropdown.
export const GET = apiRoute("patient:create", async (request) => {
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("all") === "1";

  const sources = await tenantDb.referral_sources.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return json({ sources });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(191),
  type: z.enum(TYPES),
  contactPhone: z.string().trim().max(64).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const POST = apiRoute("referral:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const source = await tenantDb.referral_sources.create({
    data: {
      name: body.name,
      type: body.type,
      contact_phone: body.contactPhone || null,
      notes: body.notes || null,
    },
  });
  emitToTenant(session.tenantId, "referralsource:created", { source });
  return json({ source }, 201);
});
