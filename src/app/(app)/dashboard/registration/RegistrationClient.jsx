"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import DynamicForm, { splitValues } from "@/components/hms/DynamicForm";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import AllergyTagInput from "@/components/hms/AllergyTagInput";
import { parseMaybeJson } from "@/components/hms/json";

const OPEN = new Set(["REGISTERED", "TRIAGE", "WITH_DOCTOR", "PHARMACY", "LAB", "BILLING"]);

export default function RegistrationClient() {
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [allergies, setAllergies] = useState([]);
  const [abhaId, setAbhaId] = useState("");
  const [queue, setQueue] = useState([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editAllergies, setEditAllergies] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [flashIds, setFlashIds] = useState(new Set());

  function flash(id) {
    setFlashIds((s) => new Set(s).add(id));
    setTimeout(() => {
      setFlashIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, 2000);
  }

  const fields = useMemo(
    () => (form ? [...form.core, ...form.extra] : []),
    [form],
  );

  async function loadQueue() {
    const { visits } = await apiGet("/api/registration/visits");
    setQueue(visits);
  }

  useEffect(() => {
    // Data fetch on mount; state is set from the resolved promise (a tick
    // later), not synchronously — the lint rule false-positives here.
    /* eslint-disable react-hooks/set-state-in-effect */
    apiGet("/api/forms/PATIENT_REGISTRATION").then((d) => setForm(d.form));
    loadQueue().catch((e) => setMsg(e.message));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useRealtime(
    {
      "visit:created": ({ visit }) => {
        flash(visit.id);
        setQueue((qs) => (qs.some((v) => v.id === visit.id) ? qs : [...qs, visit]));
      },
      "visit:updated": ({ visit }) => {
        flash(visit.id);
        setQueue((qs) => {
          const next = qs.map((v) => (v.id === visit.id ? { ...v, ...visit } : v));
          return next.filter((v) => OPEN.has(v.status));
        });
      },
      "patient:updated": ({ patient }) =>
        setQueue((qs) =>
          qs.map((v) =>
            v.patient_id === patient.id ? { ...v, patient_allergies: patient.allergies } : v,
          ),
        ),
    },
    loadQueue,
  );

  function onChange(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function register(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const { core, custom } = splitValues(form, values);
      await apiSend("/api/registration/patients", "POST", {
        name: core.name,
        age: core.age,
        gender: core.gender || "",
        phone: core.phone,
        reason: core.reason || "",
        allergies,
        abhaId,
        customFields: custom,
        openVisit: true,
      });
      setValues({});
      setAllergies([]);
      setAbhaId("");
      setMsg("Patient registered and added to the queue.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function search(e) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setResults(null);
    try {
      const { patients } = await apiGet(
        `/api/registration/patients?q=${encodeURIComponent(q.trim())}`,
      );
      setResults(patients);
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function newVisit(patientId) {
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/registration/visits", "POST", { patientId });
      setResults(null);
      setQ("");
      setMsg("New visit opened.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelVisit(id) {
    try {
      await apiSend(`/api/registration/visits/${id}`, "PATCH", {
        status: "CANCELLED",
      });
    } catch (err) {
      setMsg(err.message);
    }
  }

  function startEditAllergies(p) {
    setEditingId(p.id);
    setEditAllergies(parseMaybeJson(p.allergies) || []);
  }

  async function saveAllergies(id) {
    try {
      const { patient } = await apiSend(`/api/registration/patients/${id}`, "PATCH", {
        allergies: editAllergies,
      });
      setResults((rs) => rs?.map((p) => (p.id === id ? { ...p, allergies: patient.allergies } : p)));
      setEditingId(null);
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <section className="space-y-6">
        <h1 className="text-xl font-semibold">Registration</h1>

        {msg && (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {msg}
          </p>
        )}

        <form
          onSubmit={search}
          className="space-y-2 rounded-lg border border-slate-200 bg-white p-4"
        >
          <p className="text-sm font-semibold">Returning patient</p>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="name or phone"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">
              Find
            </button>
          </div>
          {results && results.length === 0 && (
            <p className="text-sm text-slate-400">No match.</p>
          )}
          {results?.map((p) => (
            <div key={p.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  {p.name} · {p.age}y · {p.phone}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEditAllergies(p)}
                    className="text-xs text-slate-400 hover:text-slate-700"
                  >
                    edit allergies
                  </button>
                  <button
                    onClick={() => newVisit(p.id)}
                    disabled={busy}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    New visit
                  </button>
                </div>
              </div>
              <AllergyBadge allergies={p.allergies} className="mt-1.5" />
              {editingId === p.id && (
                <div className="mt-2 space-y-2">
                  <AllergyTagInput value={editAllergies} onChange={setEditAllergies} />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveAllergies(p.id)}
                      className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-slate-400"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </form>

        <form
          onSubmit={register}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          <p className="text-sm font-semibold">New patient</p>
          {form ? (
            <>
              <DynamicForm fields={fields} values={values} onChange={onChange} />
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Allergies</span>
                <AllergyTagInput value={allergies} onChange={setAllergies} />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">ABHA ID (optional)</span>
                <input
                  value={abhaId}
                  onChange={(e) => setAbhaId(e.target.value)}
                  placeholder="14-digit Ayushman Bharat Health Account ID"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
                <span className="text-xs text-slate-400">
                  Used for India&apos;s digital health ID system — full integration coming later.
                </span>
              </label>
            </>
          ) : (
            <p className="text-sm text-slate-400">Loading form…</p>
          )}
          <button
            disabled={busy || !form}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Register &amp; add to queue
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          Today&apos;s queue ({queue.length})
        </h2>
        <div className="space-y-2">
          {queue.length === 0 && (
            <p className="text-sm text-slate-400">No open visits.</p>
          )}
          {queue.map((v) => (
            <div
              key={v.id}
              className={`flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${
                flashIds.has(v.id) ? "hms-flash" : ""
              }`}
            >
              <div>
                <p className="font-medium">
                  {v.token_number != null && (
                    <span className="mr-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white">
                      #{v.token_number}
                    </span>
                  )}
                  {v.patient_name}{" "}
                  <span className="text-slate-400">
                    · {v.patient_age}y · {v.patient_phone}
                  </span>
                </p>
                {v.reason && (
                  <p className="text-xs text-slate-500">{v.reason}</p>
                )}
                <AllergyBadge allergies={v.patient_allergies} className="mt-1" />
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {v.status.replace(/_/g, " ")}
                </span>
                {v.status === "REGISTERED" && (
                  <button
                    onClick={() => cancelVisit(v.id)}
                    className="text-xs text-slate-400 hover:text-red-600"
                  >
                    cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
