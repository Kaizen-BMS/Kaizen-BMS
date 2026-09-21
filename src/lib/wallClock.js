// Appointment slot times are wall-clock ("09:00" means 09:00 for everybody).
// The server sends them as UTC-stamped ISO strings; read the UTC parts as the
// local clock so a browser in any timezone shows the same time the doctor set.
export function wall(v) {
  const d = new Date(v);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}
export const wallLocale = (v, opts) => wall(v).toLocaleString(undefined, opts);
