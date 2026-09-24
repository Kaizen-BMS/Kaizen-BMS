"use client";

import { useEffect, useState } from "react";

export default function QueueDisplayClient({ tenantSlug }) {
  const [nowServing, setNowServing] = useState(null);
  const [room, setRoom] = useState("");
  const [waiting, setWaiting] = useState([]);
  const [counters, setCounters] = useState([]);
  const [ok, setOk] = useState(true);

  async function load() {
    const res = await fetch(`/api/display/${encodeURIComponent(tenantSlug)}/queue`);
    if (!res.ok) {
      setOk(false);
      return;
    }
    const d = await res.json();
    setNowServing(d.nowServing);
    setWaiting(d.waiting || []);
    setCounters(d.counters || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    let socket;
    let cancelled = false;
    import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      socket = io({ path: "/socket.io", query: { displayTenant: tenantSlug } });
      socket.on("visit.called", (p) => {
        setNowServing(p.tokenNumber);
        setRoom(p.room || "");
        load();
      });
      socket.io.on("reconnect", load);
    });

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  if (!ok) {
    return (
      <Screen>
        <p className="text-3xl text-slate-400">Display not available.</p>
      </Screen>
    );
  }

  // Several doctors, each with their own token series: one counter per doctor.
  if (counters.length > 1) {
    return (
      <div className="min-h-screen bg-white px-6 py-10">
        <p className="text-center text-2xl uppercase tracking-[0.3em] text-slate-400">Now Serving</p>
        <div className="mx-auto mt-8 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {counters.map((c) => (
            <div key={c.doctor} className="rounded-2xl border border-slate-200 p-6 text-center">
              <p className="text-2xl font-semibold text-slate-700">{c.doctor}</p>
              <p className="mt-3 text-8xl font-black leading-none tabular-nums text-slate-900">{c.nowServing ?? "—"}</p>
              {c.waiting.length > 0 && <p className="mt-4 text-2xl tabular-nums text-slate-500">Next: {c.waiting.slice(0, 4).join(" · ")}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Screen>
      <p className="text-2xl uppercase tracking-[0.3em] text-slate-400">Now Serving</p>
      <p className="mt-4 text-[18vw] font-black leading-none text-slate-900 tabular-nums sm:text-[14rem]">
        {nowServing ?? "—"}
      </p>
      {room && <p className="mt-2 text-3xl text-slate-600">{room}</p>}

      {waiting.length > 0 && (
        <div className="mt-16 text-center">
          <p className="text-lg uppercase tracking-[0.2em] text-slate-400">Next up</p>
          <p className="mt-3 text-5xl font-semibold tabular-nums text-slate-700">
            {waiting.slice(0, 5).join("  ·  ")}
          </p>
        </div>
      )}
    </Screen>
  );
}

function Screen({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      {children}
    </div>
  );
}
