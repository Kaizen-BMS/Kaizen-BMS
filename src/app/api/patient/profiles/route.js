import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// Every patient record this session's phone number resolves to at this
// tenant — usually one, but family members sharing a phone (or duplicate
// front-desk registrations) can mean more. The portal shows a picker when
// there's more than one; nothing here assumes a uniqueness this project
// never enforced at registration.
export const GET = patientApiRoute(async (_request, { session }) => {
  const profiles = await tenantDb.patients.findMany({
    where: { phone: session.phone },
    select: { id: true, name: true, age: true, gender: true },
    orderBy: { id: "asc" },
  });
  return json({ profiles });
});
