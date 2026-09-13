"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

async function apiGet(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const TABS = [
  { key: "appointments", label: "Appointments", module: "APPOINTMENTS" },
  { key: "medications", label: "Medications", module: "DOCTOR_OPD" },
  { key: "prescriptions", label: "Prescriptions", module: "DOCTOR_OPD" },
  { key: "lab-reports", label: "Lab Reports", module: "LAB" },
  { key: "discharge-summaries", label: "Discharge Summaries", module: "IPD" },
  { key: "bills", label: "Bills", module: "BILLING" },
];

function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}
function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export default function DashboardClient({ tenantSlug, tenantName, profiles, activeModules }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? null);
  const availableTabs = TABS.filter((t) => activeModules.includes(t.module));
  const [tab, setTab] = useState(availableTabs[0]?.key ?? null);

  async function logout() {
    await fetch("/api/patient-auth/logout", { method: "POST" });
    router.replace(`/patient/${tenantSlug}/login`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{tenantName}</h1>
          <p className="text-sm text-slate-500">Your records</p>
        </div>
        <button onClick={logout} className="text-sm text-slate-500 underline">
          Sign out
        </button>
      </div>

      {profiles.length > 1 && (
        <div className="mb-4">
          <label className="text-xs text-slate-500">Viewing</label>
          <select
            value={profileId ?? ""}
            onChange={(e) => setProfileId(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.age ? `· ${p.age}y` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {availableTabs.length === 0 ? (
        <p className="text-sm text-slate-400">No records available yet.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
            {availableTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "appointments" && <AppointmentsTab profileId={profileId} />}
          {tab === "medications" && <MedicationsTab profileId={profileId} />}
          {tab === "prescriptions" && <PrescriptionsTab profileId={profileId} />}
          {tab === "lab-reports" && <LabReportsTab profileId={profileId} />}
          {tab === "discharge-summaries" && <DischargeSummariesTab profileId={profileId} />}
          {tab === "bills" && <BillsTab profileId={profileId} />}
        </>
      )}
    </div>
  );
}

function useTabData(endpoint, profileId, key) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    const qs = profileId ? `?patientId=${profileId}` : "";
    apiGet(`/api/patient/${endpoint}${qs}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [endpoint, profileId]);

  if (error) return { error, items: null };
  if (!data) return { loading: true, items: null };
  if (data.moduleActive === false) return { inactive: true, items: null };
  return { items: data[key] };
}

function Card({ children }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">{children}</div>;
}
function TabState({ state, emptyLabel }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (state.inactive) return <p className="text-sm text-slate-400">Not available at this hospital.</p>;
  if (state.items.length === 0) return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  return null;
}

const STATUS_LABEL = {
  BOOKED: "Booked",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

function AppointmentsTab({ profileId }) {
  const state = useTabData("appointments", profileId, "appointments");
  const fallback = <TabState state={state} emptyLabel="No appointments yet." />;
  if (fallback) return fallback;
  const now = Date.now();
  const upcoming = state.items.filter((a) => new Date(a.slotTime).getTime() >= now && a.status !== "CANCELLED");
  const past = state.items.filter((a) => !(new Date(a.slotTime).getTime() >= now && a.status !== "CANCELLED"));
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Upcoming</p>
        <div className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-slate-400">None scheduled.</p>}
          {upcoming.map((a) => (
            <Card key={a.id}>
              <p className="font-medium">{fmtDateTime(a.slotTime)}</p>
              <p className="text-slate-500">Dr. {a.doctorName} · {STATUS_LABEL[a.status]}</p>
              {a.reason && <p className="text-slate-400">{a.reason}</p>}
            </Card>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Past</p>
        <div className="space-y-2">
          {past.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
          {past.map((a) => (
            <Card key={a.id}>
              <p className="font-medium">{fmtDateTime(a.slotTime)}</p>
              <p className="text-slate-500">Dr. {a.doctorName} · {STATUS_LABEL[a.status]}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function MedicationsTab({ profileId }) {
  const state = useTabData("medications", profileId, "medications");
  const fallback = <TabState state={state} emptyLabel="No active medications." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((m, i) => (
        <Card key={i}>
          <p className="font-medium">{m.medicineName}</p>
          {m.dosage && <p className="text-slate-500">{m.dosage}</p>}
        </Card>
      ))}
    </div>
  );
}

function PrescriptionsTab({ profileId }) {
  const state = useTabData("prescriptions", profileId, "prescriptions");
  const fallback = <TabState state={state} emptyLabel="No prescriptions yet." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((p) => (
        <Card key={p.id}>
          <p className="font-medium">{fmtDate(p.createdAt)} · Dr. {p.doctorName}</p>
          {p.diagnosis && <p className="text-slate-500">{p.diagnosis}</p>}
          <ul className="mt-1 list-inside list-disc text-slate-600">
            {p.items.map((it, i) => (
              <li key={i}>
                {it.medicineName} {it.dosage ? `— ${it.dosage}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function LabReportsTab({ profileId }) {
  const state = useTabData("lab-reports", profileId, "labReports");
  const fallback = <TabState state={state} emptyLabel="No lab reports yet." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((r) => (
        <Card key={r.id}>
          <p className="font-medium">{fmtDate(r.resultedAt)}</p>
          {Array.isArray(r.results) &&
            r.results.map((row, i) => (
              <p key={i} className="text-slate-600">
                {row.name || row.test}: {row.value} {row.unit || ""}
              </p>
            ))}
        </Card>
      ))}
    </div>
  );
}

function DischargeSummariesTab({ profileId }) {
  const state = useTabData("discharge-summaries", profileId, "dischargeSummaries");
  const fallback = <TabState state={state} emptyLabel="No admissions on record." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((d) => (
        <Card key={d.id}>
          <p className="font-medium">
            {fmtDate(d.admittedAt)} – {fmtDate(d.dischargedAt)}
          </p>
          <p className="text-slate-500">{d.ward} · Bed {d.bedNumber} · {d.dischargeType}</p>
          {d.dischargeNotes && <p className="mt-1 text-slate-600">{d.dischargeNotes}</p>}
        </Card>
      ))}
    </div>
  );
}

function BillsTab({ profileId }) {
  const state = useTabData("bills", profileId, "bills");
  const fallback = <TabState state={state} emptyLabel="No bills yet." />;
  if (fallback) return fallback;
  return (
    <div className="space-y-2">
      {state.items.map((b) => (
        <Card key={b.id}>
          <div className="flex items-center justify-between">
            <p className="font-medium">{fmtDate(b.createdAt)} · {b.billType}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{b.status}</span>
          </div>
          <p className="mt-1 text-slate-600">Net: ₹{b.netAmount.toFixed(2)}</p>
          {b.payAtHospital ? (
            <p className="mt-1 text-amber-700">Balance due: ₹{b.balanceDue.toFixed(2)} — pay at hospital</p>
          ) : (
            <p className="mt-1 text-green-700">Paid in full</p>
          )}
        </Card>
      ))}
    </div>
  );
}
