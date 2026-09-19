"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import PartnerReviewCard, { loadCatalogs } from "@/components/hms/PartnerReviewCard";

// Connections with OTHER organizations (external labs, pharmacies,
// hospitals) — separate from the internal Connection Center, which only
// links modules inside your own facility.

const STATUS_TONE = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  REQUESTED: "bg-amber-100 text-amber-700",
  REVIEWING: "bg-amber-100 text-amber-700",
  PAUSED: "bg-amber-100 text-amber-700",
  REJECTED: "bg-red-100 text-red-700",
  REVOKED: "bg-red-100 text-red-700",
};
const STATUS_TEXT = { REQUESTED: "Waiting for approval", REVIEWING: "Being reviewed", ACTIVE: "Connected", PAUSED: "Paused", REJECTED: "Rejected", REVOKED: "Disconnected", ACCEPTED: "Approved" };

const ERRORS = {
  partner_not_found: "No organization found with that code.",
  too_many_lookups: "Too many searches — please wait a few minutes.",
  connection_already_open: "You already have an open connection with this organization for this service.",
  service_not_offered_by_partner: "That organization does not offer this service.",
  missing_required_information: "This service needs at least the items marked as needed.",
  clinical_module_required: "Your facility needs its clinical (OPD) module to send orders.",
};

function Pill({ status }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status] || "bg-slate-100 text-slate-600"}`}>{STATUS_TEXT[status] || status}</span>;
}

export default function PartnersClient() {
  const [connections, setConnections] = useState([]);
  const [inbound, setInbound] = useState([]);
  const [catalogs, setCatalogs] = useState(null);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);

  const load = useCallback(() => {
    apiGet("/api/partners/connections").then((d) => setConnections(d.connections || [])).catch((e) => setError(e.message));
    apiGet("/api/partners/inbound").then((d) => setInbound(d.orders || [])).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    loadCatalogs().then(setCatalogs).catch(() => {});
  }, []);
  useRealtime({ "partner:request": load, "partner:updated": load, "partner:inbound": load }, load);

  const toReview = connections.filter((c) => c.direction === "INCOMING" && (c.status === "REQUESTED" || c.status === "REVIEWING"));
  const others = connections.filter((c) => !toReview.includes(c));

  async function act(id, action) {
    setError("");
    try {
      await apiSend(`/api/partners/connections/${id}`, "PATCH", { action });
      load();
    } catch (e) {
      setError(ERRORS[e.message] || `Could not update (${e.message}).`);
    }
  }

  async function openDetails(id) {
    try {
      setDetails((await apiGet(`/api/partners/connections/${id}`)).connection);
    } catch (e) {
      setError(`Could not open details (${e.message}).`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Partner Organizations</h1>
        <p className="text-sm text-[var(--hms-ink-soft)]">
          Connect with another hospital, laboratory or pharmacy. They only receive the information you approve, and either side can pause or disconnect at any time.
          Links between modules inside your own facility are managed in the Connection Center.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ConnectForm catalogs={catalogs} onSent={load} />

      {toReview.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Requests waiting for your decision</h2>
          {catalogs && toReview.map((r) => <PartnerReviewCard key={r.id} request={r} catalogs={catalogs} onDone={load} />)}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Your connections</h2>
        {others.length === 0 ? (
          <p className="text-sm text-[var(--hms-ink-soft)]">No connections yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--hms-border)" }}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-[var(--hms-ink-soft)]">
                <tr>
                  <th className="px-3 py-2">Organization</th>
                  <th className="px-3 py-2">Purpose</th>
                  <th className="px-3 py-2">Shared information</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {others.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--hms-border)" }}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{c.counterparty?.name}</p>
                      <p className="text-xs text-[var(--hms-ink-soft)]">{c.direction === "OUTGOING" ? "You requested" : "They requested"} · {c.serviceLabel}</p>
                    </td>
                    <td className="px-3 py-2">{c.purpose}</td>
                    <td className="px-3 py-2 text-xs">
                      {(c.status === "REQUESTED" ? c.requestedInformation : c.sharedInformation).join(", ") || "—"}
                      {c.modifiedByReceiver && <span className="ml-1 text-amber-700">(narrowed by receiver)</span>}
                    </td>
                    <td className="px-3 py-2"><Pill status={c.status} /></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => openDetails(c.id)} className="mr-2 text-xs underline">Details</button>
                      {c.status === "ACTIVE" && <button onClick={() => act(c.id, "PAUSE")} className="mr-2 text-xs underline">Pause</button>}
                      {c.status === "PAUSED" && c.pausedByMe && <button onClick={() => act(c.id, "RESUME")} className="mr-2 text-xs underline">Resume</button>}
                      {c.status === "PAUSED" && !c.pausedByMe && <span className="mr-2 text-xs text-[var(--hms-ink-faint)]">Paused by partner</span>}
                      {["ACTIVE", "PAUSED"].includes(c.status) && <button onClick={() => confirm("Disconnect permanently? A new request and approval would be needed to reconnect.") && act(c.id, "REVOKE")} className="text-xs text-red-600 underline">Disconnect</button>}
                      {c.status === "REQUESTED" && c.direction === "OUTGOING" && <button onClick={() => act(c.id, "REVOKE")} className="text-xs text-red-600 underline">Cancel request</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <InboundOrders orders={inbound} onDone={load} />
      {details && <DetailsModal c={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

function DetailsModal({ c, onClose }) {
  const when = (d) => (d ? new Date(d).toLocaleString() : "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-label="Connection details">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{c.counterparty?.name}</h2>
            <p className="text-xs text-[var(--hms-ink-soft)]">{c.serviceLabel} · {c.direction === "OUTGOING" ? "You requested" : "They requested"}</p>
          </div>
          <Pill status={c.status} />
        </div>
        <dl className="space-y-2 text-sm">
          <div><dt className="text-xs text-[var(--hms-ink-faint)]">Purpose</dt><dd>{c.purpose}</dd></div>
          <div><dt className="text-xs text-[var(--hms-ink-faint)]">Information asked for</dt><dd>{c.requestedInformation.join(", ") || "—"}</dd></div>
          <div><dt className="text-xs text-[var(--hms-ink-faint)]">Information being shared</dt><dd>{c.sharedInformation.length ? c.sharedInformation.join(", ") : "Nothing yet"}{c.modifiedByReceiver ? " (narrowed by the receiving organization)" : ""}</dd></div>
        </dl>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--hms-ink-faint)]">History</p>
        <ol className="mt-1 space-y-1 text-sm">
          {(c.history || []).map((h, i) => (
            <li key={i}>
              <span className="font-medium">{STATUS_TEXT[h.to] || h.to}</span>
              <span className="text-xs text-[var(--hms-ink-soft)]"> · {h.by} · {when(h.at)}</span>
              {h.note && <span className="block text-xs text-[var(--hms-ink-soft)]">{h.note}</span>}
            </li>
          ))}
        </ol>
        <button onClick={onClose} className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50" style={{ borderColor: "var(--hms-border)" }}>Close</button>
      </div>
    </div>
  );
}

function ConnectForm({ catalogs, onSent }) {
  const [code, setCode] = useState("");
  const [partner, setPartner] = useState(null);
  const [service, setService] = useState("");
  const [purpose, setPurpose] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ error: "", ok: "" });

  async function find() {
    setMsg({ error: "", ok: "" });
    setPartner(null);
    try {
      const d = await apiGet(`/api/partners/lookup?code=${encodeURIComponent(code.trim())}`);
      setPartner(d.partner);
      const first = d.partner.offers[0] || "";
      chooseService(first);
    } catch (e) {
      setMsg({ error: ERRORS[e.message] || `Could not search (${e.message}).`, ok: "" });
    }
  }

  function chooseService(s) {
    setService(s);
    setPicked(new Set()); // nothing is pre-selected — sharing is always an explicit choice
    setPurpose(s && catalogs ? catalogs[s].defaultPurpose : "");
  }

  const toggle = (k) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function send() {
    setBusy(true);
    setMsg({ error: "", ok: "" });
    try {
      await apiSend("/api/partners/requests", "POST", { code: partner.publicCode, serviceType: service, purpose, categories: [...picked] });
      setMsg({ error: "", ok: `Request sent to ${partner.name}. You will be notified when they respond.` });
      setPartner(null);
      setCode("");
      onSent();
    } catch (e) {
      setMsg({ error: ERRORS[e.message] || `Could not send (${e.message}).`, ok: "" });
    } finally {
      setBusy(false);
    }
  }

  const cat = service && catalogs ? catalogs[service] : null;
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: "var(--hms-border)" }}>
      <h2 className="text-sm font-semibold">Connect Organization</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="partner-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Organization code, e.g. LAB-KZ-8F42"
          className="min-w-[16rem] flex-1 rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--hms-border)" }}
        />
        <button onClick={find} disabled={!code.trim()} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
          Find
        </button>
      </div>
      {msg.error && <p className="mt-2 text-sm text-red-600">{msg.error}</p>}
      {msg.ok && <p className="mt-2 text-sm text-emerald-700">{msg.ok}</p>}

      {partner && (
        <div className="mt-4 space-y-3">
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="font-semibold">{partner.name}</p>
            <p className="text-xs text-[var(--hms-ink-soft)]">{partner.type.replace("_SOLO", "")} · {partner.publicCode}</p>
            {partner.existing && <p className="mt-1 text-xs text-amber-700">You already have a {STATUS_TEXT[partner.existing.status]?.toLowerCase()} request with them.</p>}
          </div>
          {partner.offers.length === 0 ? (
            <p className="text-sm text-[var(--hms-ink-soft)]">This organization does not accept laboratory or pharmacy connections.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label htmlFor="partner-service">Service</label>
                <select id="partner-service" value={service} onChange={(e) => chooseService(e.target.value)} className="rounded-md border px-2 py-1" style={{ borderColor: "var(--hms-border)" }}>
                  {partner.offers.map((o) => (
                    <option key={o} value={o}>{catalogs?.[o]?.label || o}</option>
                  ))}
                </select>
                <label htmlFor="partner-purpose" className="ml-2">Purpose</label>
                <input id="partner-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="min-w-[14rem] flex-1 rounded-md border px-2 py-1" style={{ borderColor: "var(--hms-border)" }} />
              </div>
              {cat && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--hms-ink-faint)]">Shared information — choose what you will send</p>
                  <ul className="mt-1 space-y-1">
                    {cat.categories.map((c) => (
                      <li key={c.key}>
                        <label className={`flex items-start gap-2 text-sm ${c.selectable ? "" : "opacity-60"}`}>
                          <input type="checkbox" className="mt-1" disabled={!c.selectable} checked={picked.has(c.key)} onChange={() => toggle(c.key)} />
                          <span>
                            <span className="font-medium">{c.label}</span>
                            {cat.requiredCategories.includes(c.key) && <span className="ml-1 text-[11px] text-amber-700">(needed for this service)</span>}
                            <span className="block text-xs text-[var(--hms-ink-soft)]">{c.selectable ? c.description : "Never shared"}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-[var(--hms-ink-soft)]">The partner will only receive the information approved by the receiving organization.</p>
                </div>
              )}
              <button onClick={send} disabled={busy || picked.size === 0 || !purpose.trim()} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
                Send Connection Request
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function InboundOrders({ orders, onDone }) {
  const [text, setText] = useState({});
  const [error, setError] = useState("");
  if (orders.length === 0) return null;

  async function send(o) {
    setError("");
    try {
      const v = text[o.id] || "";
      await apiSend(`/api/partners/inbound/${o.id}/result`, "POST", o.orderType === "LAB_ORDER" ? { findings: v || undefined } : { quantityFulfilled: v ? Number(v) : undefined });
      onDone();
    } catch (e) {
      setError(`Could not send the result (${e.message}).`);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Orders received from partners</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--hms-border)" }}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-[var(--hms-ink-soft)]">
            <tr>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Received information</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t align-top" style={{ borderColor: "var(--hms-border)" }}>
                <td className="px-3 py-2">{o.from}</td>
                <td className="px-3 py-2 text-xs">{o.orderType === "LAB_ORDER" ? "Lab order" : "Prescription"}<br />{o.ref}</td>
                <td className="px-3 py-2 text-xs">{Object.entries(o.payload).map(([k, v]) => `${k}: ${v}`).join(" · ")}</td>
                <td className="px-3 py-2">{o.status === "COMPLETED" ? "Result sent" : "Waiting for result"}</td>
                <td className="px-3 py-2">
                  {o.status === "RECEIVED" && o.connectionStatus === "ACTIVE" ? (
                    <div className="flex gap-1">
                      <input
                        value={text[o.id] || ""}
                        onChange={(e) => setText({ ...text, [o.id]: e.target.value })}
                        placeholder={o.orderType === "LAB_ORDER" ? "Findings" : "Quantity supplied"}
                        className="w-40 rounded-md border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--hms-border)" }}
                      />
                      <button onClick={() => send(o)} className="rounded-md bg-[var(--hms-btn-bg)] px-2 py-1 text-xs text-[var(--hms-btn-fg)]">Send result</button>
                    </div>
                  ) : o.status === "COMPLETED" ? (
                    <span className="text-xs">{o.result?.findings ?? (o.result?.quantityFulfilled != null ? `${o.result.quantityFulfilled} supplied` : "")}</span>
                  ) : (
                    <span className="text-xs text-[var(--hms-ink-faint)]">Connection not active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
