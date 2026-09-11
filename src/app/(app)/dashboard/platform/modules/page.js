import { guardPage } from "@/lib/pageGuard";
import { MODULE_REGISTRY } from "@/lib/moduleRegistry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Module Registry" };

// Read-only catalog, deliberately — see src/lib/moduleRegistry.js for why
// this isn't an "add module" form.
export default async function ModuleRegistryPage() {
  await guardPage({ action: "tenant:read" });
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Module Registry</h1>
      <p className="text-sm text-slate-500">
        Every module type this platform knows about. Renting one to a tenant happens on that tenant&apos;s detail
        screen — a module here is a catalog entry, not a per-tenant switch.
      </p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {MODULE_REGISTRY.map((m) => (
          <div key={m.key} className="flex items-start justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-semibold">{m.label} <span className="font-mono text-xs text-slate-400">{m.key}</span></p>
              <p className="text-xs text-slate-500">{m.description}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                m.rentable ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {m.rentable ? "rentable" : "planned"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
