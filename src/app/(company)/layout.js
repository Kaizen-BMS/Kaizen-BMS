import localFont from "next/font/local";
import "./kaizen.css";
import ThemeToggle from "@/components/ThemeToggle";
import ServiceRail from "@/components/ServiceRail";

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
      {children}
      <ServiceRail />
      <ThemeToggle />
    </div>
  );
}
