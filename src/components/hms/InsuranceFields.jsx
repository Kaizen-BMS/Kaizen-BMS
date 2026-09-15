"use client";

import { compressImageToDataUrl } from "./imageCompress";

// Shared between the new-patient registration form and the returning-
// patient "edit insurance / payment" panel in RegistrationClient.jsx — one
// place this section is rendered, not two copies that could drift.

export const PAYMENT_CATEGORY_LABELS = {
  SELF_PAY: "Self Pay",
  INSURANCE: "Insurance",
  CORPORATE: "Corporate",
  GOVERNMENT_SCHEME: "Government Scheme",
  AYUSHMAN_BHARAT: "Ayushman Bharat / PM-JAY",
  OTHER: "Other",
};

// The one generic "store the number of that thing" field's label varies by
// category so it reads naturally — INSURANCE already has its own Policy
// Number below, so it's left out here rather than shown twice.
const REFERENCE_LABEL = {
  CORPORATE: "Corporate / employee ID",
  GOVERNMENT_SCHEME: "Scheme reference number",
  AYUSHMAN_BHARAT: "Ayushman Bharat / PM-JAY card number",
  OTHER: "Reference number",
};

export const DEFAULT_INSURANCE = {
  paymentCategory: "SELF_PAY",
  paymentReferenceNumber: "",
  insuranceAvailable: false,
  insuranceCompany: "",
  policyNumber: "",
  memberId: "",
  tpa: "",
  validFrom: "",
  validUntil: "",
  insuranceCardUpload: "",
  preAuthRequired: false,
};

export default function InsuranceFields({ value, onChange }) {
  const v = { ...DEFAULT_INSURANCE, ...value };

  function set(patch) {
    onChange({ ...v, ...patch });
  }

  async function onCardFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // No file/blob storage in this project — compressed to a data URL
    // client-side, same convention as Attendance's proxy check-in photo,
    // just a bit larger/sharper since a card needs to stay legible.
    const dataUrl = await compressImageToDataUrl(file, 1000, 0.7);
    set({ insuranceCardUpload: dataUrl });
  }

  const referenceLabel = REFERENCE_LABEL[v.paymentCategory];

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3">
      <p className="text-sm font-semibold">Insurance / Payment</p>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Payment category</span>
        <select
          value={v.paymentCategory}
          onChange={(e) => set({ paymentCategory: e.target.value })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        >
          {Object.entries(PAYMENT_CATEGORY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {referenceLabel && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{referenceLabel}</span>
          <input
            value={v.paymentReferenceNumber}
            onChange={(e) => set({ paymentReferenceNumber: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.insuranceAvailable}
          onChange={(e) => set({ insuranceAvailable: e.target.checked })}
        />
        <span className="font-medium">Insurance available</span>
      </label>

      {v.insuranceAvailable && (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <input
            value={v.insuranceCompany}
            onChange={(e) => set({ insuranceCompany: e.target.value })}
            placeholder="Insurance company"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={v.policyNumber}
              onChange={(e) => set({ policyNumber: e.target.value })}
              placeholder="Policy number"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <input
              value={v.memberId}
              onChange={(e) => set({ memberId: e.target.value })}
              placeholder="Member ID"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>
          <input
            value={v.tpa}
            onChange={(e) => set({ tpa: e.target.value })}
            placeholder="TPA"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-xs text-slate-500">
              <span>Valid from</span>
              <input
                type="date"
                value={v.validFrom}
                onChange={(e) => set({ validFrom: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </label>
            <label className="block space-y-1 text-xs text-slate-500">
              <span>Valid until</span>
              <input
                type="date"
                value={v.validUntil}
                onChange={(e) => set({ validUntil: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-slate-500">Insurance card (photo)</span>
            <input type="file" accept="image/*" onChange={onCardFile} className="block w-full text-xs" />
            {v.insuranceCardUpload && (
              <span className="text-xs text-green-600">Card image attached.</span>
            )}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.preAuthRequired}
              onChange={(e) => set({ preAuthRequired: e.target.checked })}
            />
            <span>Pre-authorization required</span>
          </label>
        </div>
      )}
    </div>
  );
}
