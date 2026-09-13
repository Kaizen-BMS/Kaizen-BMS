"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";

const OPEN = new Set(["REGISTERED", "TRIAGE", "WITH_DOCTOR"]);

export default function OpdQueueClient() {
  const [visits, setVisits] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [flashIds, setFlashIds] = useState(new Set());

  function flash(id) {
    setFlashIds((s) => new Set(s).add(id));
    setTimeout(() => {
      setFlashIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 2000);
  }

  async function load() {
    const { visits } = await apiGet("/api/opd/queue");
    setVisits(visits);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
  }, []);

  useRealtime(
    {
      "visit:created": ({ visit }) => {
        flash(visit.id);
        setVisits((vs) =>
          vs.some((v) => v.id === visit.id) || !OPEN.has(visit.status)
            ? vs
            : [...vs, visit],
        );
      },
      "visit:updated": ({ visit }) => {
        flash(visit.id);
        setVisits((vs) =>
          vs
            .map((v) => (v.id === visit.id ? { ...v, ...visit } : v))
            .filter((v) => OPEN.has(v.status)),
        );
      },
      "consultation:created": ({ consultation }) =>
        setVisits((vs) =>
          vs.map((v) =>
            v.id === consultation.visit_id
              ? { ...v, consultation_id: consultation.id }
              : v,
          ),
        ),
    },
    load,
  );

  async function callNext() {
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/opd/queue/call-next", "POST");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const waiting = visits.filter((v) => v.status === "REGISTERED" || v.status === "TRIAGE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Doctor / OPD queue</h1>
        <button
          onClick={callNext}
          disabled={busy || waiting === 0}
          className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Call next {waiting > 0 ? `(${waiting} waiting)` : ""}
        </button>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="space-y-2">
        {visits.length === 0 && (
          <p className="text-sm text-slate-400">Queue is empty.</p>
        )}
        {visits.map((v) => (
          <Link
            key={v.id}
            href={`/dashboard/opd/${v.id}`}
            className={`flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 text-sm hover:border-slate-400 ${
              flashIds.has(v.id) ? "hms-flash" : ""
            }`}
          >
            <div>
              <p className="font-medium">
                {v.token_number != null && (
                  <span className="mr-1.5 rounded bg-[var(--hms-btn-bg)] px-1.5 py-0.5 text-xs font-semibold text-white">
                    #{v.token_number}
                  </span>
                )}
                {v.patient_name}{" "}
                <span className="text-slate-400">· {v.patient_age}y</span>
              </p>
              {v.reason && <p className="text-xs text-slate-500">{v.reason}</p>}
              <AllergyBadge allergies={v.patient_allergies} className="mt-1" />
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                v.consultation_id
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {v.consultation_id ? "in progress" : "waiting"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
