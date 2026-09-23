import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { getTenant } from "@/lib/tenants";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  headerName: z.string().trim().min(1).max(191),
  qualifications: z.string().trim().max(255).optional().or(z.literal("")),
  signatureImage: z.string().max(400_000).regex(/^data:image\/(jpeg|png|webp);base64,/).optional().or(z.literal("")),
});

// A staff doctor's personal branding — their name + qualifications layered
// on top of the hospital's header at the signature line. Only reachable
// (and only meaningful) when the hospital has switched this on; re-checked
// here server-side, not just hidden in the UI.
export const PUT = apiRoute("branding:manage_own", async (request, { session }) => {
  const tenant = await getTenant(session.tenantId);
  if (!tenant?.allow_doctor_branding) {
    throw new HttpError(403, "doctor_branding_not_enabled");
  }

  const body = await parseBody(request, putSchema);
  const tid = requireTenantId();

  // A blank signatureImage means "leave it as-is" (the person didn't touch
  // that field this time) — omitted means "leave", an explicit "" from the
  // client (via a Remove button) is filtered out before it ever reaches
  // here as blank, so we can't tell "clear it" apart from "didn't send
  // it" with plain omission; the client always sends the current value
  // back unless clearing, so treat present to blank as an explicit clear.
  const hasSignature = body.signatureImage !== undefined;

  await tenantDb.print_branding.upsert({
    where: {
      tenant_id_doctor_user_id: { tenant_id: BigInt(tid), doctor_user_id: BigInt(session.userId) },
    },
    update: { header_name: body.headerName, qualifications: body.qualifications || null, ...(hasSignature ? { signature_image: body.signatureImage || null } : {}) },
    create: {
      scope: "DOCTOR",
      doctor_user_id: BigInt(session.userId),
      header_name: body.headerName,
      qualifications: body.qualifications || null,
      signature_image: body.signatureImage || null,
    },
  });

  const ownBranding = await tenantDb.print_branding.findFirst({
    where: { scope: "DOCTOR", doctor_user_id: BigInt(session.userId) },
  });
  emitToTenant(session.tenantId, "branding:updated", { scope: "DOCTOR", branding: ownBranding });
  return json({ ownBranding });
});
