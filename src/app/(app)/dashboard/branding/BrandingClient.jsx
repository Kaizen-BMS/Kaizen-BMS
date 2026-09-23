"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { compressImageToDataUrl } from "@/components/hms/imageCompress";

const EMPTY_TENANT = {
  headerName: "",
  logoUrl: "",
  qualifications: "",
  address: "",
  phone: "",
  gstin: "",
  footerText: "",
  signatureImage: "",
};
const EMPTY_OWN = { headerName: "", qualifications: "", signatureImage: "" };

export default function BrandingClient() {
  const [data, setData] = useState(null);
  const [tenantForm, setTenantForm] = useState(EMPTY_TENANT);
  const [ownForm, setOwnForm] = useState(EMPTY_OWN);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await apiGet("/api/branding");
    setData(d);
    if (d.tenantBranding) {
      setTenantForm({
        headerName: d.tenantBranding.header_name || "",
        logoUrl: d.tenantBranding.logo_url || "",
        qualifications: d.tenantBranding.qualifications || "",
        address: d.tenantBranding.address || "",
        phone: d.tenantBranding.phone || "",
        gstin: d.tenantBranding.gstin || "",
        footerText: d.tenantBranding.footer_text || "",
        signatureImage: d.tenantBranding.signature_image || "",
      });
    }
    if (d.ownBranding) {
      setOwnForm({
        headerName: d.ownBranding.header_name || "",
        qualifications: d.ownBranding.qualifications || "",
        signatureImage: d.ownBranding.signature_image || "",
      });
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
  }, []);

  async function saveTenant(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/branding/tenant", "PUT", tenantForm);
      setMsg("Saved. Every new printed document uses this from now on.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveOwn(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/branding/doctor", "PUT", ownForm);
      setMsg("Saved. Your prescriptions now show this at the signature line.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAllowDoctorBranding(next) {
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/branding/settings", "PATCH", { allowDoctorBranding: next });
      setData((d) => ({ ...d, allowDoctorBranding: next }));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  const isSolo = data.tenantType !== "HOSPITAL";

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Branding</h1>
      <p className="text-sm text-slate-500">
        What prints on prescriptions, lab reports and receipts.
      </p>
      {msg && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{msg}</p>
      )}

      {data.canManageTenant ? (
        <form onSubmit={saveTenant} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">
            {isSolo ? "Your practice branding" : "Hospital branding (default on every document)"}
          </p>
          <Field label="Header name" value={tenantForm.headerName} onChange={(v) => setTenantForm((s) => ({ ...s, headerName: v }))} required />
          <Field label="Logo URL" value={tenantForm.logoUrl} onChange={(v) => setTenantForm((s) => ({ ...s, logoUrl: v }))} />
          {isSolo && (
            <>
              <Field label="Qualifications (e.g. MBBS, MD)" value={tenantForm.qualifications} onChange={(v) => setTenantForm((s) => ({ ...s, qualifications: v }))} />
              <div className="space-y-1.5 text-sm">
                <span className="font-medium">Signature</span>
                <p className="text-xs text-slate-500">Shown as an image at the signature line on your prescriptions and reports.</p>
                <div className="flex items-center gap-3">
                  {tenantForm.signatureImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tenantForm.signatureImage} alt="Your signature" className="h-14 rounded border border-slate-200 bg-white px-2" />
                  ) : (
                    <span className="text-xs text-slate-400">No signature uploaded yet.</span>
                  )}
                  <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
                    {tenantForm.signatureImage ? "Change" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        const url = await compressImageToDataUrl(file, 400, 0.8);
                        setTenantForm((s) => ({ ...s, signatureImage: url }));
                      }}
                    />
                  </label>
                  {tenantForm.signatureImage && (
                    <button type="button" onClick={() => setTenantForm((s) => ({ ...s, signatureImage: "" }))} className="text-xs text-red-600 underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
          <Field label="Address" value={tenantForm.address} onChange={(v) => setTenantForm((s) => ({ ...s, address: v }))} />
          <Field label="Phone" value={tenantForm.phone} onChange={(v) => setTenantForm((s) => ({ ...s, phone: v }))} />
          <Field label="GSTIN" value={tenantForm.gstin} onChange={(v) => setTenantForm((s) => ({ ...s, gstin: v }))} />
          <Field label="Footer text" value={tenantForm.footerText} onChange={(v) => setTenantForm((s) => ({ ...s, footerText: v }))} />
          <button
            disabled={busy}
            className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
          >
            Save
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-400">
          Only the hospital admin can edit the hospital&apos;s branding.
        </p>
      )}

      {!isSolo && data.canManageTenant && (
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <input
            type="checkbox"
            checked={data.allowDoctorBranding}
            onChange={(e) => toggleAllowDoctorBranding(e.target.checked)}
            disabled={busy}
          />
          <span>
            Let individual doctors add their own name/qualifications to their prescriptions,
            on top of the hospital header.
          </span>
        </label>
      )}

      {!isSolo && data.canManageOwn && (
        <form onSubmit={saveOwn} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">Your personal branding</p>
          <p className="text-xs text-slate-500">
            Layered on top of the hospital header at the signature line — not a replacement for it.
          </p>
          <Field label="Your name" value={ownForm.headerName} onChange={(v) => setOwnForm((s) => ({ ...s, headerName: v }))} required />
          <Field label="Qualifications" value={ownForm.qualifications} onChange={(v) => setOwnForm((s) => ({ ...s, qualifications: v }))} placeholder="MBBS, MD (Medicine)" />
          <div className="space-y-1.5 text-sm">
            <span className="font-medium">Signature</span>
            <p className="text-xs text-slate-500">Shown as an image at the signature line on your prescriptions and reports (e.g. lab reports you finalize) — not just your typed name.</p>
            <div className="flex items-center gap-3">
              {ownForm.signatureImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ownForm.signatureImage} alt="Your signature" className="h-14 rounded border border-slate-200 bg-white px-2" />
              ) : (
                <span className="text-xs text-slate-400">No signature uploaded yet.</span>
              )}
              <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">
                {ownForm.signatureImage ? "Change" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const url = await compressImageToDataUrl(file, 400, 0.8);
                    setOwnForm((s) => ({ ...s, signatureImage: url }));
                  }}
                />
              </label>
              {ownForm.signatureImage && (
                <button type="button" onClick={() => setOwnForm((s) => ({ ...s, signatureImage: "" }))} className="text-xs text-red-600 underline">
                  Remove
                </button>
              )}
            </div>
          </div>
          <button
            disabled={busy}
            className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
          >
            Save
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required, placeholder }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
      />
    </label>
  );
}
