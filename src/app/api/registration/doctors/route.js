import { apiRoute, json } from "@/lib/apiRoute";
import { listOpdDoctors, MINUTES_PER_PATIENT } from "@/lib/opdDoctors";

export const dynamic = "force-dynamic";

// Doctors reception can register a patient with — timing, queue length, estimated turn.
export const GET = apiRoute("visit:create", async (_request, { session }) =>
  json({ doctors: await listOpdDoctors(session.tenantId), minutesPerPatient: MINUTES_PER_PATIENT }),
);
