"use client";

import { useEffect, useState } from "react";

export default function QueueDisplayClient({ tenantSlug }) {
  const [nowServing, setNowServing] = useState(null);
  const [room, setRoom] = useState("");
  const [waiting, setWaiting] = useState([]);
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
