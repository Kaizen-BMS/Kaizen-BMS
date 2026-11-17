import { Suspense } from "react";
import localFont from "next/font/local";
import Script from "next/script";
import "./kaizen.css";
import ThemeToggle from "@/components/ThemeToggle";
import GoogleAnalyticsPageview from "@/components/GoogleAnalyticsPageview";

// Google Analytics (gtag.js) — marketing-site traffic only, scoped to this
// layout on purpose (never the root layout) so the logged-in HMS product
// and patient portal — real patient/staff data in their URLs — are never
// sent to Google. `afterInteractive` loads it without blocking first paint.
const GA_MEASUREMENT_ID = "G-Z51EMKRLPE";

// Runs before paint, straight from the server-rendered markup, so a
// visitor who already picked dark mode never sees a light-mode flash.
// No saved choice yet? Leave the attribute unset — kaizen.css's
// prefers-color-scheme fallback already renders the right theme with
// zero JS, and ThemeToggle resolves the same value on mount.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("kbms-theme");if(t==="dark"||t==="light"){document.currentScript.parentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

// Bundled in src/fonts so the build never depends on reaching Google Fonts.
const kbmsSerif = localFont({
  src: [
    { path: "../../fonts/playfair-display-latin-wght-normal.woff2", weight: "400 900", style: "normal" },
    { path: "../../fonts/playfair-display-latin-wght-italic.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-kbms-serif",
  display: "swap",
});

const kbmsSans = localFont({
  src: "../../fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-kbms-sans",
  display: "swap",
});

export const metadata = {
  title: {
    default: "Kaizen BMS | Business Management, Technology & Growth Partner",
    template: "%s | Kaizen BMS",
  },
};

/**
 * Layout for the Kaizen BMS marketing site (Company route group).
 * The `.kbms-site` wrapper + font variables scope the black / off-white /
 * cyan editorial design system to this section of the app only — it does
 * not touch the root layout or leak into /hospital-management or
 * /placement-services.
 */
export default function CompanyLayout({ children }) {
  return (
    <div
      className={`kbms-site font-body ${kbmsSerif.variable} ${kbmsSans.variable} antialiased`}
      suppressHydrationWarning
    >
      <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
      <Suspense fallback={null}>
        <GoogleAnalyticsPageview gaId={GA_MEASUREMENT_ID} />
      </Suspense>
      {children}
      <ThemeToggle />
    </div>
  );
}
