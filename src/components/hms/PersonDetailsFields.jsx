"use client";

import { useState } from "react";
import CameraCapture from "./CameraCapture";
import Avatar from "./Avatar";
import DateInput from "./DateInput";
import PhoneInput from "./PhoneInput";

export const EMPTY_DETAILS = {
  phone: "", designation: "", joinDate: "", address: "", nativePlace: "", emergencyContact: "", bloodGroup: "", aadhaarNo: "", photoDataUrl: "",
  employeeId: "", department: "", dutyType: "FIXED", dutyStart: "", dutyEnd: "",
};
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const label = "block text-xs font-medium text-slate-600";
const help = "mt-0.5 block text-[11px] font-normal leading-tight text-slate-400";

/** Only the filled-in details, ready to send. */
export function detailsPayload(d) {
  const out = {};
  for (const [k, v] of Object.entries(d)) if (v !== "" && v != null && k !== "photo") out[k] = v;
  return out;
}

/** Hours between two "HH:MM" values (a night shift wraps past midnight). */
export function dutyHoursText(start, end) {
  if (!start || !end) return "—";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hours ${m} min` : `${h} hour${h === 1 ? "" : "s"}`;
}

// Personal details + a face photo. The photo is what the attendance photo is
// compared with, so ask for a clear front-facing picture. `showWork` adds
// Employee ID, Department and the working hours (total hours worked out for you).
export default function PersonDetailsFields({ name, value, onChange, showJoin = true, showDesignation = true, showEmergency = true, showWork = false, parts }) {
  const on = (k) => (parts ? parts.includes(k) : k !== "work" || showWork);
  const [cam, setCam] = useState(false);
  const set = (k, v) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-4">
      {on("photo") && <div className="flex items-center gap-3">
        <Avatar name={name || "New"} src={value.photoDataUrl || value.photo} size={64} />
        <div className="text-xs">
          {cam && <CameraCapture title="Profile photo" maxWidth={360} onCapture={(u) => { set("photoDataUrl", u); setCam(false); }} onClose={() => setCam(false)} />}
          <button type="button" onClick={() => setCam(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            {value.photoDataUrl || value.photo ? "Change photo" : "Add photo (camera / file)"}
          </button>
          <p className="mt-1 text-slate-500">Clear, front-facing — attendance photos are matched against this.</p>
        </div>
      </div>}
      {(on("basic") || on("more")) && <div className="grid gap-3 sm:grid-cols-2">
        {on("basic") && showWork && (
          <>
            <label className={label}>Employee ID<input value={value.employeeId} onChange={(e) => set("employeeId", e.target.value)} placeholder="EMP-014" className={`${input} mt-1`} /><span className={help}>Your own staff number (optional).</span></label>
            <label className={label}>Department<input value={value.department} onChange={(e) => set("department", e.target.value)} placeholder="Nursing" className={`${input} mt-1`} /><span className={help}>Where they work.</span></label>
          </>
        )}
        {on("basic") && <PhoneInput label="Phone" value={value.phone} onChange={(v) => set("phone", v)} />}
        {on("basic") && showJoin && <div className={label}>Joining date<DateInput value={value.joinDate} onChange={(v) => set("joinDate", v)} className={`${input} mt-1`} /><span className={help}>DD/MM/YY</span></div>}
        {on("basic") && showDesignation && <label className={label}>Designation<input value={value.designation} onChange={(e) => set("designation", e.target.value)} placeholder="Senior Nurse" className={`${input} mt-1`} /></label>}
        {on("more") && <><label className={label}>Aadhaar number<input value={value.aadhaarNo} onChange={(e) => set("aadhaarNo", e.target.value)} inputMode="numeric" placeholder="12 digits" maxLength={14} className={`${input} mt-1`} /></label>
        <label className={`${label} sm:col-span-2`}>Address<input value={value.address} onChange={(e) => set("address", e.target.value)} className={`${input} mt-1`} /></label>
        <label className={label}>Native place / from where<input value={value.nativePlace} onChange={(e) => set("nativePlace", e.target.value)} className={`${input} mt-1`} /></label>
        {showEmergency && <label className={label}>Emergency contact<input value={value.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} placeholder="Name and phone" className={`${input} mt-1`} /></label>}
        <label className={label}>Blood group
          <select value={value.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} className={`${input} mt-1`}>
            <option value="">—</option>
            {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label></>}
      </div>}
      {on("work") && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-sm font-semibold">Working hours</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            <div className={label}>Duty Type
              <div className="mt-1 flex overflow-hidden rounded-lg border border-slate-300 text-sm">
                {[["FIXED", "Fixed"], ["SHIFT", "Shift"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => set("dutyType", k)} className={`flex-1 px-3 py-1.5 ${value.dutyType === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-white text-slate-500"}`}>{l}</button>
                ))}
              </div>
              <span className={help}>{value.dutyType === "SHIFT" ? "Shifts are set on the Duty Roster." : "Same hours every working day."}</span>
            </div>
            <label className={label}>Duty Start<input type="time" value={value.dutyStart} onChange={(e) => set("dutyStart", e.target.value)} className={`${input} mt-1`} /><span className={help}>e.g. 09:00 AM</span></label>
            <label className={label}>Duty End<input type="time" value={value.dutyEnd} onChange={(e) => set("dutyEnd", e.target.value)} className={`${input} mt-1`} /><span className={help}>e.g. 05:00 PM</span></label>
            <div className={label}>Total Duty Hours<p className="mt-1 rounded-lg bg-white px-2.5 py-1.5 text-sm font-semibold">{dutyHoursText(value.dutyStart, value.dutyEnd)}</p><span className={help}>Calculated automatically.</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
