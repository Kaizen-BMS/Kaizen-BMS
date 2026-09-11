import { guardPage } from "@/lib/pageGuard";
import BrandingClient from "./BrandingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Branding" };

// Deliberately NOT under dashboard/admin/ — that layout is HOSPITAL_ADMIN
// only, but a staff doctor with their own scope=DOCTOR branding (when the
// tenant allows it) needs to reach this page too. Fine-grained
// tenant-vs-own visibility is handled inside BrandingClient, driven by
// /api/branding's canManageTenant / canManageOwn.
export default async function BrandingPage() {
  await guardPage({ action: "branding:read" });
  return <BrandingClient />;
}
