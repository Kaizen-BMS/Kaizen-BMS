"use client";

import { motion } from "framer-motion";
import OrbitalGraphic from "./OrbitalGraphic";
import MaskedText from "./MaskedText";

/**
 * Shared hero for product sub-pages (Hospital Management, Placement
 * Services). Same asymmetric-editorial language and masked-reveal
 * headline as the homepage hero, one notch down in scale since it isn't
 * the site's primary entry point.
 */
export default function PageHero({
  eyebrow,
  title,
  accent,
  supporting,
  primaryLabel,
  primaryHref = "#contact",
  secondaryLabel,
  secondaryHref = "#contact",
}) {
  return (
    <section className="relative overflow-hidden pt-24 md:pt-28">
      <div className="pointer-events-none absolute -right-16 -top-6 h-48 w-48 opacity-70 sm:h-60 sm:w-60 md:-right-8 md:-top-4 md:h-80 md:w-80 md:opacity-90 lg:right-[-5%] lg:top-[-32px] lg:h-[460px] lg:w-[460px] lg:opacity-100">
        <OrbitalGraphic className="h-full w-full" />
      </div>

      <div className="relative mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <div className="grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-10 lg:col-span-8">
            {eyebrow && (
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="font-body text-[11px] font-medium uppercase tracking-[0.2em] text-(--kbms-ink-soft)"
              >
                {eyebrow}
              </motion.p>
            )}

            <h1 className="font-display mt-4 text-[clamp(30px,4vw,52px)] font-normal leading-[1.1] tracking-tight text-(--kbms-ink)">
              <MaskedText text={title} />
              {accent && (
                <>
                  <br />
                  <MaskedText
                    text={accent}
                    delay={0.2}
                    className="italic text-[#08DCDC]"
                  />
                </>
              )}
            </h1>

            {supporting && (
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.6, ease: "easeOut" }}
                className="mt-5 max-w-lg font-body text-sm leading-relaxed text-(--kbms-ink-soft) md:text-base"
              >
                {supporting}
              </motion.p>
            )}

            {(primaryLabel || secondaryLabel) && (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.75, ease: "easeOut" }}
                className="mt-7 flex flex-wrap items-center gap-6"
              >
                {primaryLabel && (
                  <a
                    href={primaryHref}
                    className="kbms-glass group inline-flex items-center gap-2 px-7 py-3.5 font-body text-sm font-medium text-(--kbms-bg) transition-colors hover:bg-[#08DCDC] hover:text-(--kbms-ink)"
                  >
                    {primaryLabel}
                    <span className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </a>
                )}
                {secondaryLabel && (
                  <a
                    href={secondaryHref}
                    className="group inline-flex items-center gap-2 border-b border-(--kbms-ink)/30 pb-1 font-body text-sm font-medium text-(--kbms-ink) transition-colors hover:border-(--kbms-ink)"
                  >
                    {secondaryLabel}
                  </a>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
