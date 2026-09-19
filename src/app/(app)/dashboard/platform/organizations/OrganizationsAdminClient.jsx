"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

const TYPE_LABEL = { HOSPITAL: "Hospital", LAB_SOLO: "Laboratory", PHARMACY_SOLO: "Pharmacy", DOCTOR_SOLO: "Clinic" };

const ERR = {
  organization_not_found: "That organization no longer exists.",
  tenant_not_found: "That facility no longer exists.",
  user_not_found: "No user with that email exists yet.",
};

// Platform view of owner organizations: who owns what. Attach a facility to
// an organization, add an owner login. Internal ids stay hidden — public
// facility codes are shown because owners use them to connect.
export default function OrganizationsAdminClient() {
  const [orgs, setOrgs] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [newName, setNewName] = useState("");

  const load = useCallback(() => {
    apiGet("/api/admin/organizations").then((d) => setOrgs(d.organizations)).catch((e) => setMsg({ error: e.message, ok: "" }));
    apiGet("/api/admin/tenants").then((d) => setTenants(d.tenants || [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function run(fn, ok) {
    setMsg({ error: "", ok: "" });
    try {
      await fn();
      setMsg({ error: "", ok });
      load();
    } catch (e) {
      setMsg({ error: ERR[e.message] || `Could not save (${e.message}).`, ok: "" });
    }
  }

  const orgOf = new Map();
  (orgs || []).forEach((o) => o.facilities.forEach((f) => orgOf.set(f.id, o.name)));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Organizations</h1>
        <p className="text-sm text-[var(--hms-ink-soft)]">Each organization is one owner group. Its owners can switch between all of its facilities.</p>
      </div>
      {msg.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}

      <div className="flex flex-wrap gap-2">
        <input id="new-org-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New organization name" className="min-w-[16rem] rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: "var(--hms-border)" }} />
        <button
          disabled={!newName.trim()}
          onClick={() => run(async () => { await apiSend("/api/admin/organizations", "POST", { name: newName.trim() }); setNewName(""); }, "Organization created.")}
          className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          Create organization
        </button>
      </div>

      {!orgs ? (
        <p className="text-sm text-[var(--hms-ink-soft)]">Loading…</p>
      ) : (
        <div className="space-y-4">
          {orgs.map((o) => (
            <OrgCard key={o.id} org={o} tenants={tenants} orgOf={orgOf} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrgCard({ org, tenants, orgOf, run }) {
  const [tenantId, setTenantId] = useState("");
  const [email, setEmail] = useState("");
  const attachable = tenants.filter((t) => orgOf.get(Number(t.id)) !== org.name);
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: "var(--hms-border)" }} data-testid="org-card">
      <h2 className="font-semibold">{org.name}</h2>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--hms-ink-faint)]">Facilities</p>
      {org.facilities.length === 0 ? (
        <p className="text-sm text-[var(--hms-ink-soft)]">No facilities yet.</p>
      ) : (
        <ul className="text-sm">
          {org.facilities.map((f) => (
            <li key={f.id}>
              {f.name} <span className="text-xs text-[var(--hms-ink-soft)]">· {TYPE_LABEL[f.type] || f.type} · {f.publicCode}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Facility to attach" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="rounded-md border px-2 py-1" style={{ borderColor: "var(--hms-border)" }}>
          <option value="">Attach a facility…</option>
          {attachable.map((t) => (
            <option key={t.id} value={t.id}>{t.name}{orgOf.get(Number(t.id)) ? ` (now in ${orgOf.get(Number(t.id))})` : ""}</option>
          ))}
        </select>
        <button
          disabled={!tenantId}
          onClick={() => run(async () => { await apiSend(`/api/admin/organizations/${org.id}/facilities`, "POST", { tenantId: Number(tenantId) }); setTenantId(""); }, "Facility attached.")}
          className="rounded-md border px-2.5 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
          style={{ borderColor: "var(--hms-border)" }}
        >
          Attach
        </button>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--hms-ink-faint)]">Owners</p>
      {org.owners.length === 0 ? (
        <p className="text-sm text-[var(--hms-ink-soft)]">No owners yet.</p>
      ) : (
        <ul className="text-sm">
          {org.owners.map((w) => (
            <li key={w.email}>{w.name} <span className="text-xs text-[var(--hms-ink-soft)]">· {w.email}</span></li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <input aria-label="Owner email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Existing user's email" className="min-w-[14rem] rounded-md border px-2 py-1" style={{ borderColor: "var(--hms-border)" }} />
        <button
          disabled={!email.trim()}
          onClick={() => run(async () => { await apiSend(`/api/admin/organizations/${org.id}/owners`, "POST", { email: email.trim() }); setEmail(""); }, "Owner added.")}
          className="rounded-md border px-2.5 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
          style={{ borderColor: "var(--hms-border)" }}
        >
          Add owner
        </button>
      </div>
    </section>
  );
}
