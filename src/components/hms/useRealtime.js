"use client";

import { useEffect } from "react";
import { subscribe } from "@/lib/socketClient";

/**
 * Bind socket event handlers for the lifetime of a component.
 * `events` = { eventName: handler }. `onResync` runs once on every
 * reconnect — do exactly one fresh fetch there. Never poll.
 */
export function useRealtime(events, onResync) {
  useEffect(() => {
    return subscribe({ events, onResync });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
