"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// gtag's own auto-pageview only fires on the very first script load — a
// client-side route change in this App Router never reloads the page, so
// without this every navigation past the entry page would be invisible in
// Analytics. Fired as its own `page_view` event (not a second `config`
// call, which would also silently reset the session's client id).
export default function GoogleAnalyticsPageview({ gaId }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window.gtag !== "function") return;
    const query = searchParams.toString();
    window.gtag("event", "page_view", {
      page_path: query ? `${pathname}?${query}` : pathname,
      send_to: gaId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}
