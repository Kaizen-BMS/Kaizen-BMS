import { z } from "zod";

const opt = (n) => z.string().trim().max(n).optional().or(z.literal(""));

// Everything we keep about a person besides their login: used for records and
// to match the face in the attendance photo against the profile photo.
export const detailsShape = {
  phone: opt(32),
  designation: opt(100),
  joinDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  address: opt(500),
  nativePlace: opt(191),
  emergencyContact: opt(64),
  aadhaarNo: z.string().trim().regex(/^[0-9 ]{12,14}$/, "aadhaar must be 12 digits").optional().or(z.literal("")),
  employeeId: opt(40),
  department: opt(100),
  dutyType: z.enum(["FIXED", "SHIFT"]).optional(),
  dutyStart: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  dutyEnd: z.string().trim().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  photoDataUrl: z.string().max(400_000).regex(/^data:image\/(jpeg|png|webp);base64,/).optional().or(z.literal("")),
};

/** Only the fields that were sent become column updates ("" clears the value). */
export function toProfileData(b) {
  const d = {};
  if (b.phone !== undefined) d.phone = b.phone || null;
  if (b.designation !== undefined) d.designation = b.designation || null;
  if (b.joinDate !== undefined) d.join_date = b.joinDate ? new Date(b.joinDate) : null;
  if (b.address !== undefined) d.address = b.address || null;
  if (b.nativePlace !== undefined) d.native_place = b.nativePlace || null;
  if (b.emergencyContact !== undefined) d.emergency_contact = b.emergencyContact || null;
  if (b.aadhaarNo !== undefined) d.aadhaar_no = b.aadhaarNo ? b.aadhaarNo.replace(/\s+/g, "") : null;
  if (b.employeeId !== undefined) d.employee_id = b.employeeId || null;
  if (b.department !== undefined) d.department = b.department || null;
  if (b.dutyType !== undefined) d.duty_type = b.dutyType;
  if (b.dutyStart !== undefined) d.duty_start = b.dutyStart ? new Date(`1970-01-01T${b.dutyStart}:00.000Z`) : null;
  if (b.dutyEnd !== undefined) d.duty_end = b.dutyEnd ? new Date(`1970-01-01T${b.dutyEnd}:00.000Z`) : null;
  if (b.photoDataUrl !== undefined) d.photo_url = b.photoDataUrl || null;
  return d;
}

export function serializeProfile(p) {
  return {
    joinDate: p?.join_date ?? null,
    phone: p?.phone ?? null,
    designation: p?.designation ?? null,
    address: p?.address ?? null,
    nativePlace: p?.native_place ?? null,
    emergencyContact: p?.emergency_contact ?? null,
    aadhaarNo: p?.aadhaar_no ?? null,
    photo: p?.photo_url ?? null,
    employeeId: p?.employee_id ?? null,
    department: p?.department ?? null,
    dutyType: p?.duty_type ?? "FIXED",
    dutyStart: p?.duty_start ? new Date(p.duty_start).toISOString().slice(11, 16) : null,
    dutyEnd: p?.duty_end ? new Date(p.duty_end).toISOString().slice(11, 16) : null,
  };
}
