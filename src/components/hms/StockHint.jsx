"use client";

import { useEffect, useState } from "react";
import { apiGet } from "./api";

// Two-line "is it available?" hint under the medicine name while prescribing.
// Sources are the doctor's own pharmacy and any partner pharmacy that chose
// to share; only names + available / not available are ever returned.
export default function StockHint({ query, onPick }) {
  const [sources, setSources] = useState([]);
  useEffect(() => {
    const q = (query || "").trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSources([]);
      return;
    }
    const t = setTimeout(() => {
      apiGet(`/api/pharmacy/availability?q=${encodeURIComponent(q)}`).then((d) => setSources(d.sources || [])).catch(() => setSources([]));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  if (sources.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[11px]">
      {sources.map((s) => (
        <p key={s.label} className="text-slate-500">
          <span className="font-medium text-slate-600">{s.label}:</span>{" "}
          {s.matches.length === 0 ? (
            <span className="text-amber-700">not available</span>
          ) : (
            s.matches.map((m) => (
              <button key={m.name} type="button" onClick={() => onPick(m.name)} className="mr-2 underline decoration-dotted">
                {m.name} <span className={m.available ? "text-emerald-700" : "text-amber-700"}>{m.available ? "✓ available" : "✗ not available"}</span>
              </button>
            ))
          )}
        </p>
      ))}
    </div>
  );
}
