"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

// External Integration Foundation — Connection Center extension for
// external providers (this task's UI requirement). Same "plain, fast,
// functional" style as ModuleConnectionsClient.jsx, kept as its own screen
// rather than folded into it — a provider connection has a genuinely
// different shape (credentials, health, simulate) that the module-to-module
// Connection Center never needed. Internal Connection Center behavior
// (module-connections) is completely untouched by this file.

function Pill({ status }) {
  const tone =
    status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" :
    status === "PENDING" ? "bg-amber-100 text-amber-700" :
    status === "REVOKED" ? "bg-red-100 text-red-700" :
    "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

// The full 8-state vocabulary externalProviders.js's deriveHealth()/
// deriveConnectionHealth() can return (Real Vendor Integration Readiness
// TASK 13) — never collapsed back down to a generic "OK/not OK," since the
// whole point of the distinct states is telling an admin AUTH_FAILED
// (fix the credential) apart from UNREACHABLE (a network/vendor-side
// problem) apart from CONFIG_ERROR (nothing configured yet).
function HealthPill({ health }) {
  const tone =
    health === "HEALTHY" || health === "CONNECTED" ? "bg-emerald-100 text-emerald-700" :
    health === "DEGRADED" ? "bg-amber-100 text-amber-700" :
    health === "AUTH_FAILED" || health === "UNREACHABLE" || health === "REVOKED" ? "bg-red-100 text-red-700" :
    health === "CONFIG_ERROR" ? "bg-orange-100 text-orange-700" :
    health === "PAUSED" || health === "PENDING" ? "bg-amber-100 text-amber-700" :
    "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{health}</span>;
}

function EnvPill({ environment }) {
  const tone = environment === "PRODUCTION" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{environment}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ExternalIntegrationsClient() {
  const [tab, setTab] = useState("providers");
  const [providers, setProviders] = useState(null);
  const [connections, setConnections] = useState(null);
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState("");
  const [showCreateProvider, setShowCreateProvider] = useState(false);
  const [showCreateConnection, setShowCreateConnection] = useState(false);
  const [credentialFor, setCredentialFor] = useState(null);
  const [healthFor, setHealthFor] = useState(null);
  const [simulateFor, setSimulateFor] = useState(null);
  const [editingProvider, setEditingProvider] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  async function loadProviders() {
    try {
      const res = await apiGet("/api/external/providers");
      setProviders(res.providers);
    } catch (e) {
      setErr(e.message);
    }
  }
  async function loadConnections() {
    try {
      const res = await apiGet("/api/external/connections");
      setConnections(res.connections);
    } catch (e) {
      setErr(e.message);
    }
  }
  async function loadOrders() {
    try {
      const res = await apiGet("/api/external/orders");
      setOrders(res.orders);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    loadProviders();
    loadConnections();
    loadOrders();
  }, []);

  async function setConnectionStatus(id, status) {
    if (status === "REVOKED" && !confirm("Revoke this connection? This cannot be undone.")) return;
    try {
      await apiSend(`/api/external/connections/${id}`, "PATCH", { status });
      await loadConnections();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function retryOrder(id) {
    try {
      await apiSend(`/api/external/orders/${id}/retry`, "POST", {});
      await loadOrders();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function checkOrderStatus(id) {
    try {
      const res = await apiSend(`/api/external/orders/${id}/check-status`, "POST", {});
      setErr(res.ok ? "" : `Status check returned: ${res.rawStatus ?? "no status"}`);
      await loadOrders();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function testConnection(providerId) {
    setTestingId(providerId);
    setTestResult(null);
    try {
      const res = await apiSend(`/api/external/providers/${providerId}/test-connection`, "POST", {});
      setTestResult({ providerId, ...res });
      await loadProviders();
    } catch (e) {
      setTestResult({ providerId, ok: false, error: { message: e.message } });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">External Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          External lab/pharmacy providers, connections, credentials, and outbound order activity. Secrets are
          never shown here — only whether one is configured.
        </p>
      </div>

      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="flex flex-wrap gap-2">
        {[
          { key: "providers", label: "Providers" },
          { key: "connections", label: "Connections" },
          { key: "orders", label: "Outbound Orders" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tab === t.key ? "border-[var(--hms-btn-bg)] bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "providers" && (
        <div className="space-y-3">
          <button onClick={() => setShowCreateProvider(true)} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)]">
            + Register provider
          </button>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Env</th>
                  <th className="px-3 py-2">Health</th>
                  <th className="px-3 py-2">Credential</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers === null && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">Loading…</td></tr>}
                {providers && providers.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">No providers registered yet.</td></tr>}
                {providers && providers.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      {p.name}
                      {p.resolvedBaseUrl && <div className="text-xs text-slate-400">{p.resolvedBaseUrl}</div>}
                    </td>
                    <td className="px-3 py-2">{p.providerType}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.providerCode}</td>
                    <td className="px-3 py-2"><EnvPill environment={p.environment} /></td>
                    <td className="px-3 py-2"><HealthPill health={p.health} /></td>
                    <td className="px-3 py-2">{p.hasCredential ? <span className="text-emerald-600">Set</span> : <span className="text-slate-400">Not set</span>}</td>
                    <td className="px-3 py-2 space-x-2">
                      <button onClick={() => setEditingProvider(p)} className="text-xs text-slate-600 underline">Edit</button>
                      <button onClick={() => setCredentialFor(p)} className="text-xs text-slate-600 underline">Credential</button>
                      <button onClick={() => setHealthFor(p)} className="text-xs text-slate-600 underline">Health</button>
                      <button onClick={() => testConnection(p.id)} disabled={testingId === p.id} className="text-xs text-slate-600 underline disabled:opacity-50">
                        {testingId === p.id ? "Testing…" : "Test connection"}
                      </button>
                      {["MOCK_LAB", "MOCK_PHARMACY"].includes(p.providerCode) && (
                        <button onClick={() => setSimulateFor(p)} className="text-xs text-slate-600 underline">Simulate webhook</button>
                      )}
                      {testResult?.providerId === p.id && (
                        <div className={`mt-1 text-xs ${testResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                          {testResult.ok ? `Connected (${testResult.latencyMs}ms)` : testResult.error?.message || "not supported"}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "connections" && (
        <div className="space-y-3">
          <button onClick={() => setShowCreateConnection(true)} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)]">
            + Connect provider
          </button>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {connections === null && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">Loading…</td></tr>}
                {connections && connections.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">No external connections yet.</td></tr>}
                {connections && connections.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{c.source?.name || c.source?.id}</td>
                    <td className="px-3 py-2">{c.provider?.name || c.provider?.id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.connectionType}</td>
                    <td className="px-3 py-2"><Pill status={c.status} /></td>
                    <td className="px-3 py-2 space-x-2">
                      {c.status === "PENDING" && <button onClick={() => setConnectionStatus(c.id, "ACTIVE")} className="text-xs text-emerald-700 underline">Approve</button>}
                      {c.status === "ACTIVE" && <button onClick={() => setConnectionStatus(c.id, "PAUSED")} className="text-xs text-amber-700 underline">Pause</button>}
                      {c.status === "PAUSED" && <button onClick={() => setConnectionStatus(c.id, "ACTIVE")} className="text-xs text-emerald-700 underline">Resume</button>}
                      {c.status !== "REVOKED" && <button onClick={() => setConnectionStatus(c.id, "REVOKED")} className="text-xs text-red-700 underline">Revoke</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">External ref</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Last error</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders === null && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">Loading…</td></tr>}
              {orders && orders.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">No outbound orders yet.</td></tr>}
              {orders && orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{o.orderType}</td>
                  <td className="px-3 py-2 font-mono text-xs">{o.externalOrderRef || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={o.status === "FAILED" ? "text-red-600" : o.status === "COMPLETED" ? "text-emerald-600" : "text-slate-600"}>{o.status}</span>
                  </td>
                  <td className="px-3 py-2">{o.attempts}</td>
                  <td className="px-3 py-2 text-red-600">{o.lastError || "—"}</td>
                  <td className="px-3 py-2">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 space-x-2">
                    {o.status === "FAILED" && <button onClick={() => retryOrder(o.id)} className="text-xs text-slate-600 underline">Retry</button>}
                    {o.externalOrderRef && <button onClick={() => checkOrderStatus(o.id)} className="text-xs text-slate-600 underline">Check status</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateProvider && (
        <CreateProviderModal onClose={() => setShowCreateProvider(false)} onCreated={() => { setShowCreateProvider(false); loadProviders(); }} />
      )}
      {showCreateConnection && (
        <CreateConnectionModal onClose={() => setShowCreateConnection(false)} onCreated={() => { setShowCreateConnection(false); loadConnections(); }} providers={providers || []} />
      )}
      {credentialFor && (
        <CredentialModal provider={credentialFor} onClose={() => setCredentialFor(null)} onSaved={() => { setCredentialFor(null); loadProviders(); }} />
      )}
      {healthFor && <HealthModal provider={healthFor} onClose={() => setHealthFor(null)} />}
      {simulateFor && <SimulateModal provider={simulateFor} onClose={() => setSimulateFor(null)} />}
      {editingProvider && (
        <EditProviderModal provider={editingProvider} onClose={() => setEditingProvider(null)} onSaved={() => { setEditingProvider(null); loadProviders(); }} />
      )}
    </div>
  );
}

function CreateProviderModal({ onClose, onCreated }) {
  const [providerType, setProviderType] = useState("LAB");
  const [providerCode, setProviderCode] = useState("MOCK_LAB");
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("SANDBOX");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      await apiSend("/api/external/providers", "POST", { providerType, providerCode, name, environment });
      onCreated();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Register external provider" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-500">Provider type</label>
          <select
            value={providerType}
            onChange={(e) => {
              const v = e.target.value;
              setProviderType(v);
              setProviderCode(v === "LAB" ? "MOCK_LAB" : "MOCK_PHARMACY");
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="LAB">Lab</option>
            <option value="PHARMACY">Pharmacy</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Provider code</label>
          <select value={providerCode} onChange={(e) => setProviderCode(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {providerType === "LAB" ? <option value="MOCK_LAB">MOCK_LAB (sandbox)</option> : <option value="MOCK_PHARMACY">MOCK_PHARMACY (sandbox)</option>}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            No real external lab/pharmacy provider is wired up yet — only the mock/sandbox adapter. When a real
            vendor&apos;s adapter is added, its code appears here too.
          </p>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Environment</label>
          <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="SANDBOX">Sandbox</option>
            <option value="PRODUCTION">Production</option>
          </select>
          <p className="mt-1 text-xs text-slate-400">
            Sandbox and Production are separate provider rows, each with their own credentials/base URL/history —
            register one of each for the same vendor code rather than switching one row between them.
          </p>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Sandbox Lab Partner" />
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button onClick={submit} disabled={saving || !name.trim()} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50">
          {saving ? "Registering…" : "Register"}
        </button>
      </div>
    </Modal>
  );
}

function EditProviderModal({ provider, onClose, onSaved }) {
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl || "");
  const [active, setActive] = useState(provider.active);
  const [sandboxBaseUrl, setSandboxBaseUrl] = useState(provider.config?.sandboxBaseUrl || "");
  const [productionBaseUrl, setProductionBaseUrl] = useState(provider.config?.productionBaseUrl || "");
  const [authType, setAuthType] = useState(provider.config?.authType || "NONE");
  const [apiKeyHeader, setApiKeyHeader] = useState(provider.config?.apiKeyHeader || "");
  const [timeoutMs, setTimeoutMs] = useState(provider.config?.timeoutMs || "");
  const [statusMapJson, setStatusMapJson] = useState(provider.config?.statusMap ? JSON.stringify(provider.config.statusMap, null, 2) : "");
  const [mockFailureMode, setMockFailureMode] = useState(!!provider.config?.mockFailureMode);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const isMock = ["MOCK_LAB", "MOCK_PHARMACY"].includes(provider.providerCode);

  async function submit() {
    setSaving(true);
    setErr("");
    let statusMap;
    if (statusMapJson.trim()) {
      try {
        statusMap = JSON.parse(statusMapJson);
      } catch {
        setErr("Status map must be valid JSON, e.g. { \"RECEIVED\": \"ORDERED\" }");
        setSaving(false);
        return;
      }
    }
    try {
      await apiSend(`/api/external/providers/${provider.id}`, "PATCH", {
        name,
        baseUrl,
        active,
        config: {
          sandboxBaseUrl: sandboxBaseUrl || undefined,
          productionBaseUrl: productionBaseUrl || undefined,
          authType,
          apiKeyHeader: apiKeyHeader || undefined,
          timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
          statusMap,
          mockFailureMode: isMock ? mockFailureMode : undefined,
        },
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit provider — ${provider.name}`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <div>
          <label className="block text-xs text-slate-500">Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>

        <div className="border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Endpoint</p>
          <label className="mt-2 block text-xs text-slate-500">Legacy single base URL (used when no per-environment URL below is set)</label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="https://api.vendor.com" />
          <label className="mt-2 block text-xs text-slate-500">Sandbox base URL</label>
          <input value={sandboxBaseUrl} onChange={(e) => setSandboxBaseUrl(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="https://sandbox-api.vendor.com" />
          <label className="mt-2 block text-xs text-slate-500">Production base URL</label>
          <input value={productionBaseUrl} onChange={(e) => setProductionBaseUrl(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="https://api.vendor.com" />
        </div>

        <div className="border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Authentication (used by a real adapter&apos;s outbound calls)</p>
          <select value={authType} onChange={(e) => setAuthType(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="NONE">None</option>
            <option value="API_KEY">API key header</option>
            <option value="BEARER">Bearer token</option>
            <option value="BASIC">Basic auth</option>
            <option value="HMAC">HMAC-signed request</option>
          </select>
          {authType === "API_KEY" && (
            <input value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Header name, e.g. x-api-key" />
          )}
          <p className="mt-1 text-xs text-slate-400">The actual key/token/secret values are set under Credential, never here — this only says which scheme to use.</p>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Behavior</p>
          <label className="mt-2 block text-xs text-slate-500">Request timeout (ms)</label>
          <input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="10000" />
          <label className="mt-2 block text-xs text-slate-500">Status mapping (vendor status → Kaizen status, JSON)</label>
          <textarea
            value={statusMapJson}
            onChange={(e) => setStatusMapJson(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            rows={4}
            placeholder='{ "RECEIVED": "ORDERED", "COMPLETED": "RESULTED" }'
          />
        </div>

        {isMock && (
          <div className="border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Mock/testing only</p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mockFailureMode} onChange={(e) => setMockFailureMode(e.target.checked)} />
              Force outbound failure (for exercising retry) — never available on a real vendor.
            </label>
          </div>
        )}

        {err && <p className="text-sm text-red-700">{err}</p>}
        <button onClick={submit} disabled={saving} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function CredentialModal({ provider, onClose, onSaved }) {
  const [advanced, setAdvanced] = useState(false);
  const [secret, setSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      if (advanced) {
        const fields = {};
        if (apiKey) fields.apiKey = apiKey;
        if (bearerToken) fields.bearerToken = bearerToken;
        if (webhookSecret) fields.webhookSecret = webhookSecret;
        if (clientId) fields.clientId = clientId;
        if (clientSecret) fields.clientSecret = clientSecret;
        if (Object.keys(fields).length === 0) throw new Error("Enter at least one field");
        await apiSend(`/api/external/providers/${provider.id}/credential`, "PUT", { fields });
      } else {
        await apiSend(`/api/external/providers/${provider.id}/credential`, "PUT", { secret });
      }
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Set credential — ${provider.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Stored encrypted (AES-256-GCM) and never shown back. For the mock/sandbox adapter, the single secret
          below doubles as the HMAC key used to sign/verify the &ldquo;simulate webhook&rdquo; test action.
        </p>
        <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-xs text-slate-500 underline">
          {advanced ? "Use a single secret instead" : "A real vendor needs more than one secret? Switch to named fields →"}
        </button>

        {!advanced ? (
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Provider secret / API key"
          />
        ) : (
          <div className="space-y-2">
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="API key" />
            <input type="password" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Bearer token" />
            <input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Webhook signing secret" />
            <input type="password" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Client ID" />
            <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Client secret" />
            <p className="text-xs text-slate-400">Fill in only what the vendor&apos;s documentation actually gave you — leave the rest blank.</p>
          </div>
        )}
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button onClick={submit} disabled={saving || (!advanced && !secret.trim())} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function HealthModal({ provider, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet(`/api/external/providers/${provider.id}/health`).then(setData).catch((e) => setErr(e.message));
  }, [provider.id]);

  return (
    <Modal title={`Health — ${provider.name}`} onClose={onClose}>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {!data && !err && <p className="text-sm text-slate-400">Loading…</p>}
      {data && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Health</span><HealthPill health={data.provider.health} /></div>
          <div className="flex justify-between"><span className="text-slate-500">Last success</span><span>{data.provider.lastSuccessAt ? new Date(data.provider.lastSuccessAt).toLocaleString() : "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Last failure</span><span>{data.provider.lastFailureAt ? new Date(data.provider.lastFailureAt).toLocaleString() : "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Failure count</span><span>{data.provider.failureCount}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Last latency</span><span>{data.provider.lastLatencyMs != null ? `${data.provider.lastLatencyMs} ms` : "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Pending outbound orders</span><span>{data.pendingOutboundOrders}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Failed outbound orders</span><span>{data.failedOutboundOrders}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Failed inbound events</span><span>{data.failedInboundEvents}</span></div>
          {data.recentFailedWebhooks.length > 0 && (
            <div className="pt-2">
              <div className="text-xs uppercase text-slate-500">Recent failed webhooks</div>
              <ul className="mt-1 space-y-1">
                {data.recentFailedWebhooks.map((w) => (
                  <li key={w.id} className="text-xs text-red-700">{w.eventType} — {w.lastError} ({w.attempts} attempts)</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function SimulateModal({ provider, onClose }) {
  const [externalOrderRef, setExternalOrderRef] = useState("");
  const [findings, setFindings] = useState("");
  const [quantityFulfilled, setQuantityFulfilled] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    setErr("");
    setResult(null);
    try {
      const body = { externalOrderRef };
      if (provider.providerType === "LAB") body.findings = findings;
      else body.quantityFulfilled = quantityFulfilled ? Number(quantityFulfilled) : undefined;
      const res = await apiSend(`/api/external/providers/${provider.id}/simulate`, "POST", body);
      setResult(res);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title={`Simulate provider webhook — ${provider.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Makes a real, signed HTTP call to Kaizen&apos;s own webhook endpoint — exercising the genuine inbound
          pipeline (signature, replay window, idempotency, contract validation, business update, realtime), not a
          function-call shortcut. Use the external order reference from an order you sent (Outbound Orders tab).
        </p>
        <input
          value={externalOrderRef}
          onChange={(e) => setExternalOrderRef(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
          placeholder="e.g. MOCKLAB-AB12CD34"
        />
        {provider.providerType === "LAB" ? (
          <textarea
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Simulated findings (optional)"
          />
        ) : (
          <input
            type="number"
            value={quantityFulfilled}
            onChange={(e) => setQuantityFulfilled(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Quantity fulfilled (optional)"
          />
        )}
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button onClick={submit} disabled={sending || !externalOrderRef.trim()} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50">
          {sending ? "Sending…" : "Send simulated webhook"}
        </button>
        {result && (
          <pre className="max-h-48 overflow-auto rounded-md bg-slate-50 p-2 text-xs">{JSON.stringify(result, null, 2)}</pre>
        )}
      </div>
    </Modal>
  );
}

function CreateConnectionModal({ onClose, onCreated, providers }) {
  const [instances, setInstances] = useState([]);
  const [contracts, setContracts] = useState({});
  const [sourceInstanceId, setSourceInstanceId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet("/api/module-instances?module=DOCTOR_OPD").then((res) => setInstances(res.instances || [])).catch(() => {});
    apiGet("/api/external/connections").then((res) => setContracts(res.contracts || {})).catch(() => {});
  }, []);

  const selectedProvider = providers.find((p) => String(p.id) === String(providerId));
  const connectionType = selectedProvider
    ? Object.entries(contracts).find(([, c]) => c.sourceModule === "DOCTOR_OPD" && c.targetModule === `EXTERNAL_${selectedProvider.providerType}`)?.[0]
    : null;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      await apiSend("/api/external/connections", "POST", { sourceInstanceId: Number(sourceInstanceId), providerId: Number(providerId), connectionType, purpose });
      onCreated();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Connect an external provider" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-500">Source (Clinical / OPD instance)</label>
          <select value={sourceInstanceId} onChange={(e) => setSourceInstanceId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select…</option>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Provider</label>
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.providerType})</option>)}
          </select>
        </div>
        {connectionType && <p className="text-xs text-slate-500">Data contract: <span className="font-mono">{connectionType}</span></p>}
        <div>
          <label className="block text-xs text-slate-500">Purpose (optional)</label>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !sourceInstanceId || !providerId || !connectionType}
          className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          {saving ? "Requesting…" : "Request connection"}
        </button>
      </div>
    </Modal>
  );
}
