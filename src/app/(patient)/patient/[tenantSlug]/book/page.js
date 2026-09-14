import { redirect } from "next/navigation";
import { getPatientSession } from "@/lib/patientSession";
import { getTenant } from "@/lib/tenants";
import { tenantDb } from "@/lib/prismaClient";
import { runWithContext } from "@/lib/requestContext";
import BookClient from "./BookClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book an appointment" };

export default async function BookPage({ params }) {
  const { tenantSlug } = await params;
  const session = await getPatientSession();
  if (!session) redirect(`/patient/${tenantSlug}/login`);

  const tenant = await getTenant(session.tenantId);
  if (!tenant || !tenant.active) redirect(`/patient/${tenantSlug}/login`);
  if (tenant.slug !== tenantSlug) redirect(`/patient/${tenant.slug}/book`);

  // The callback MUST be an async function that itself awaits the Prisma
  // call — a bare `() => tenantDb.x.findMany()` loses the AsyncLocalStorage
  // tenant context crossing Prisma's native query-engine boundary (see
  // CLAUDE.md's Prisma section).
  const profiles = await runWithContext(
    { userId: null, tenantId: session.tenantId, role: "PATIENT", tenantType: tenant.type },
    async () => {
      return await tenantDb.patients.findMany({
        where: { phone: session.phone },
        select: { id: true, name: true, age: true },
        orderBy: { id: "asc" },
      });
    },
  );

  return (
    <BookClient
      tenantSlug={tenant.slug}
      profiles={profiles.map((p) => ({ ...p, id: Number(p.id) }))}
    />
  );
}
