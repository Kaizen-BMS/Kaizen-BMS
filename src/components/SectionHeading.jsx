"use client";

import { motion } from "framer-motion";
import MaskedText from "./MaskedText";

/**
 * Shared section-header pattern: small uppercase eyebrow label + large
 * serif statement. Reused across sections but each section still supplies
 * its own layout around it (split screen, grid, full-bleed, etc.) rather
 * than this component dictating the whole section shape.
 */
export default function SectionHeading({
  eyebrow,
  title,
  supporting,
  align = "left",
  size = "lg",
  className = "",
}) {
  const sizeClass =
    size === "xl"
      ? "text-[clamp(28px,3.6vw,44px)]"
      : size === "md"
        ? "text-[clamp(23px,2.6vw,32px)]"
        : "text-[clamp(25px,3vw,38px)]";

  return (
    <div
      className={`${align === "center" ? "mx-auto text-center" : ""} ${className}`}
    >
      {eyebrow && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 0.5 }}
          className="font-body text-[11px] font-medium uppercase tracking-[0.2em] text-[#08DCDC]"
        >
          {eyebrow}
        </motion.p>
      )}
      <h2
        className={`font-display mt-3 ${sizeClass} font-normal leading-[1.12] tracking-tight text-(--kbms-ink)`}
      >
        {typeof title === "string" ? (
          <MaskedText text={title} stagger={0.04} />
        ) : (
          title
        )}
      </h2>
      {supporting && (
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 0.6, delay: 0.12 }}
          className={`font-body mt-4 max-w-xl text-sm leading-relaxed text-(--kbms-ink-soft) md:text-base ${
            align === "center" ? "mx-auto" : ""
          }`}
        >
          {supporting}
        </motion.p>
      )}
    </div>
  );
}
