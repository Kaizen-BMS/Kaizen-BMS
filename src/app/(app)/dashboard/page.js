import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getActiveModules } from "@/lib/modules";
import { getTenant, isSolo } from "@/lib/tenants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const TYPE_LABEL = {
  HOSPITAL: "Hospital",
  DOCTOR_SOLO: "Solo doctor practice",
  PHARMACY_SOLO: "Independent pharmacy",
  LAB_SOLO: "Diagnostic lab",
};

export default async function DashboardHome() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.tenantId == null) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Kaizen Platform</h1>
        <p className="text-sm text-slate-500">
          Signed in as SUPER ADMIN. The Super Admin dashboard (create tenants,
          module rentals, suspend/reactivate) is the next build step.
        </p>
      </div>
    );
  }

  const tenant = await getTenant(session.tenantId);
  const modules = await getActiveModules(session.tenantId);
  const solo = isSolo(tenant?.type);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{tenant?.name}</h1>
        <p className="text-sm text-slate-500">
          {TYPE_LABEL[tenant?.type] || tenant?.type} · signed in as{" "}
          {session.role.replace(/_/g, " ").toLowerCase()}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">
          {solo ? "Your module" : "Active modules"}
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {modules.length === 0 && (
            <li className="text-sm text-slate-400">None</li>
          )}
          {modules.map((m) => (
            <li
              key={m}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
            >
              {m.replace(/_/g, " ")}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-500">
        {solo
          ? "This is your single-purpose workspace — only your module's screens appear in the sidebar."
          : "Modules are rented by the Kaizen platform team; use the sidebar to open each area."}
      </p>
    </div>
  );
}
