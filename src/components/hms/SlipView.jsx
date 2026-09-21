import { PAPERS } from "@/lib/printSettings";

// The registration slip. Used by the real print page AND the settings preview,
// so the preview is exactly what prints.
export default function SlipView({ settings, branding, data }) {
  const s = settings.slip;
  const paper = PAPERS[s.paper];
  const narrow = s.paper === "THERMAL80" || s.paper === "THERMAL58" || s.paper === "A6";
  const row = (label, value) => (
    <div className="flex justify-between gap-3 border-b border-dashed border-slate-300 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
  return (
    <div style={{ width: paper.width, maxWidth: "100%" }} className={`mx-auto bg-white text-slate-900 ${narrow ? "p-3 text-[11px]" : "p-8 text-sm"}`}>
      <div className="border-b-2 border-slate-900 pb-2 text-center">
        {branding?.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logo} alt="" className="mx-auto mb-1 h-10" />
        )}
        <p className={`font-bold ${narrow ? "text-sm" : "text-xl"}`}>{branding?.name || "Your facility"}</p>
        {branding?.address && <p className="text-slate-500">{branding.address}</p>}
        {branding?.phone && <p className="text-slate-500">{branding.phone}</p>}
      </div>
      <p className={`mt-2 text-center font-semibold uppercase tracking-wide ${narrow ? "text-xs" : "text-base"}`}>{s.title}</p>

      {s.showToken && data.token != null && (
        <div className="my-3 text-center">
          <p className="text-slate-500">Token</p>
          <p className={`font-bold leading-none ${narrow ? "text-4xl" : "text-6xl"}`}>{data.token}</p>
        </div>
      )}

      <div className="mt-2">
        {row("Patient", data.name)}
        {(s.showAge || s.showGender) && row("Age / Gender", [s.showAge ? `${data.age ?? "—"} y` : null, s.showGender ? (data.gender || "—").toString().toLowerCase() : null].filter(Boolean).join(" · "))}
        {s.showPhone && row("Phone", data.phone || "—")}
        {s.showReason && data.reason && row("Reason", data.reason)}
        {data.doctor && row("Doctor", data.doctor)}
        {s.showDateTime && row("Date", data.when)}
        {s.showFee && data.fee != null && row("Fee paid", `₹${Number(data.fee).toLocaleString("en-IN")}`)}
      </div>
      {s.footer && <p className="mt-3 text-center text-slate-500">{s.footer}</p>}
    </div>
  );
}
