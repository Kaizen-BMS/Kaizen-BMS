import { redirect } from "next/navigation";
import { getPatientSession } from "@/lib/patientSession";
import { getTenant } from "@/lib/tenants";
import { tenantDb } from "@/lib/prismaClient";
import { runWithContext } from "@/lib/requestContext";
import { getActiveModules } from "@/lib/modules";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "My records" };

// proxy.js already blocks a request with no/invalid patient session; this
// re-check is defense in depth, and also canonicalizes the URL — a session
// is scoped to one tenantId, and the URL's [tenantSlug] segment could in
// principle not match it (stale link, hand-edited URL). Every actual query
// still derives its tenant from the verified session, never the URL, so
// there is no data-leak risk either way — this is purely about showing the
// right hospital's name instead of a confusing mismatch.
export default async function PatientDashboardPage({ params }) {
  const { tenantSlug } = await params;
  const session = await getPatientSession();
  if (!session) redirect(`/patient/${tenantSlug}/login`);

  const tenant = await getTenant(session.tenantId);
  if (!tenant || !tenant.active) redirect(`/patient/${tenantSlug}/login`);
  if (tenant.slug !== tenantSlug) redirect(`/patient/${tenant.slug}/dashboard`);

  const [profiles, activeModules] = await runWithContext(
    { userId: null, tenantId: session.tenantId, role: "PATIENT", tenantType: tenant.type },
    async () =>
      Promise.all([
        tenantDb.patients.findMany({
          where: { phone: session.phone },
          select: { id: true, name: true, age: true, gender: true },
          orderBy: { id: "asc" },
        }),
        getActiveModules(session.tenantId),
      ]),
  );

  return (
    <DashboardClient
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      profiles={profiles.map((p) => ({ ...p, id: Number(p.id) }))}
      activeModules={activeModules}
    />
  );
}
