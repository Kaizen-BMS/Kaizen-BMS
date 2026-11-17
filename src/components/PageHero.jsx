"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import MaskedText from "./MaskedText";

/**
 * Shared hero for every sub-page — every caller passes a real `image` for a
 * photo column (the earlier decorative OrbitalGraphic fallback is gone, so
 * every sub-page reads consistently with the homepage/blog/careers look).
 * `dark` switches to the navy treatment (e.g. Careers).
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
  dark = false,
  image,
  imageAlt = "",
}) {
  const inkClass = dark ? "text-white" : "text-(--kbms-ink)";
  const softClass = dark ? "text-white/70" : "text-(--kbms-ink-soft)";
  const eyebrowClass = dark ? "text-white/60" : "text-(--kbms-ink-soft)";
  const accentClass = dark ? "text-[#4ADE80]" : "text-[#16A34A]";

  return (
    <section
      className={`relative overflow-hidden pt-24 md:pt-28 ${dark ? "bg-[#0A2A43]" : ""}`}
    >
      <div className="relative mx-auto max-w-[1400px] px-6 py-10 md:grid md:grid-cols-12 md:items-center md:gap-8 md:pb-16 md:pl-10 md:pr-16 lg:pr-20">
        <div className={image ? "md:col-span-7" : "md:col-span-10 lg:col-span-8"}>
          {eyebrow && (
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className={`font-body text-[11px] font-medium uppercase tracking-[0.2em] ${eyebrowClass}`}
            >
              {eyebrow}
            </motion.p>
          )}

          <h1
            className={`font-display mt-4 text-[clamp(30px,4vw,52px)] font-normal leading-[1.1] tracking-tight ${inkClass}`}
          >
            <MaskedText text={title} />
            {accent && (
              <>
                <br />
                <MaskedText text={accent} delay={0.2} className={accentClass} />
              </>
            )}
          </h1>

          {supporting && (
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6, ease: "easeOut" }}
              className={`mt-5 max-w-lg font-body text-sm leading-relaxed md:text-base ${softClass}`}
            >
              {supporting}
            </motion.p>
          )}

          {(primaryLabel || secondaryLabel) && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.75, ease: "easeOut" }}
              className="mt-7 flex flex-wrap items-center gap-4"
            >
              {primaryLabel && (
                <a
                  href={primaryHref}
                  className="group inline-flex items-center gap-2 rounded-full bg-[#16A34A] px-7 py-3.5 font-body text-sm font-medium text-white shadow-[0_4px_18px_rgba(22,163,74,0.3)] transition-colors hover:bg-[#15803D]"
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
                  className={`inline-flex items-center gap-2 rounded-full border px-7 py-3.5 font-body text-sm font-medium transition-colors ${
                    dark
                      ? "border-white/30 text-white hover:border-white hover:bg-white/10"
                      : "border-(--kbms-ink)/25 text-(--kbms-ink) hover:border-(--kbms-ink) hover:bg-(--kbms-hover)"
                  }`}
                >
                  {secondaryLabel}
                </a>
              )}
            </motion.div>
          )}
        </div>

        {image && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="relative mt-10 h-[240px] overflow-hidden rounded-2xl md:col-span-5 md:mt-0 md:h-[360px]"
          >
            <Image
              src={image}
              alt={imageAlt}
              fill
              sizes="(min-width: 768px) 40vw, 90vw"
              className="object-cover"
            />
          </motion.div>
        )}
      </div>
    </section>
  );
}
