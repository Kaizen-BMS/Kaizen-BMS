"use client";

import { useEffect } from "react";

// Opens the browser's print window as soon as the page is ready.
export default function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
