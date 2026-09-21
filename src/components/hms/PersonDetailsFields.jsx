"use client";

import { useState } from "react";
import CameraCapture from "./CameraCapture";
import Avatar from "./Avatar";

export const EMPTY_DETAILS = { phone: "", designation: "", joinDate: "", address: "", nativePlace: "", emergencyContact: "", aadhaarNo: "", photoDataUrl: "" };

const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

/** Only the filled-in details, ready to send. */
export function detailsPayload(d) {
  const out = {};
  for (const [k, v] of Object.entries(d)) if (v !== "" && v != null) out[k] = v;
  return out;
}

// Personal details + a face photo. The photo is what the attendance photo is
// compared with, so ask for a clear front-facing picture.
export default function PersonDetailsFields({ name, value, onChange, showJoin = true, showDesignation = true, showEmergency = true }) {
  const [cam, setCam] = useState(false);
  const set = (k, v) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar name={name || "New"} src={value.photoDataUrl || value.photo} size={64} />
        <div className="text-xs">
          {cam && <CameraCapture title="Profile photo" maxWidth={360} onCapture={(u) => { set("photoDataUrl", u); setCam(false); }} onClose={() => setCam(false)} />}
          <button type="button" onClick={() => setCam(true)} className="rounded-md border border-slate-300 px-2.5 py-1.5 hover:bg-slate-50">
            {value.photoDataUrl || value.photo ? "Change photo" : "Add photo (camera / file)"}
          </button>
          <p className="mt-1 text-slate-500">Clear, front-facing — attendance photos are matched against this.</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs"><span className="block text-slate-500">Phone</span><input value={value.phone} onChange={(e) => set("phone", e.target.value)} className={input} /></label>
        <label className="text-xs"><span className="block text-slate-500">Aadhaar number</span><input value={value.aadhaarNo} onChange={(e) => set("aadhaarNo", e.target.value)} inputMode="numeric" placeholder="12 digits" maxLength={14} className={input} /></label>
        <label className="text-xs sm:col-span-2"><span className="block text-slate-500">Address</span><input value={value.address} onChange={(e) => set("address", e.target.value)} className={input} /></label>
        <label className="text-xs"><span className="block text-slate-500">Native place / from where</span><input value={value.nativePlace} onChange={(e) => set("nativePlace", e.target.value)} className={input} /></label>
        {showEmergency && <label className="text-xs"><span className="block text-slate-500">Emergency contact</span><input value={value.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} className={input} /></label>}
        {showDesignation && <label className="text-xs"><span className="block text-slate-500">Designation</span><input value={value.designation} onChange={(e) => set("designation", e.target.value)} className={input} /></label>}
        {showJoin && <label className="text-xs"><span className="block text-slate-500">Joining date</span><input type="date" value={value.joinDate} onChange={(e) => set("joinDate", e.target.value)} className={input} /></label>}
      </div>
    </div>
  );
}
