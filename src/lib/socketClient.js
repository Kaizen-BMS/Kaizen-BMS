"use client";

import { io } from "socket.io-client";

/**
 * One shared browser socket for the whole HMS app. The session cookie rides
 * along automatically (same origin), so the server authenticates the socket
 * from it and joins the right hospital rooms — the client never sends a
 * tenantId.
 *
 * Real-time contract (see CLAUDE.md):
 *   - one fetch on mount, then update purely from socket events
 *   - on reconnect, run exactly one fresh fetch to resync (pass `onResync`)
 *   - never poll
 */
let socket;

export function getSocket() {
  if (!socket) {
    socket = io({ path: "/socket.io", withCredentials: true });
  }
  return socket;
}

/**
 * Subscribe a component to a set of events. Returns an unsubscribe fn.
 *
 *   useEffect(() => subscribe({
 *     events: { "patient:new": (p) => setPatients((xs) => [p.patient, ...xs]) },
 *     onResync: loadPatients,
 *   }), []);
 */
export function subscribe({ events = {}, onResync }) {
  const s = getSocket();
  const entries = Object.entries(events);
  for (const [name, fn] of entries) s.on(name, fn);

  const handleReconnect = () => {
    if (onResync) onResync();
  };
  if (onResync) s.io.on("reconnect", handleReconnect);

  return () => {
    for (const [name, fn] of entries) s.off(name, fn);
    if (onResync) s.io.off("reconnect", handleReconnect);
  };
}
