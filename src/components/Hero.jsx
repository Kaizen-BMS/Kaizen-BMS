"use client";

import { motion } from "framer-motion";
import GrowthGraphic from "./GrowthGraphic";
import MaskedText from "./MaskedText";

export default function Hero() {
  return (
    <section id="home" className="relative overflow-hidden pt-24 md:pt-28">
      {/* animated orbital field — fills the right side, clear of the (now
          smaller) headline which sits in the left 8/12 at lg. Centered
          vertically on the section (top-1/2 + -translate-y-1/2) instead of
          pinned to the top, and pulled in from the edge instead of
          bleeding off-screen. */}
      <div className="pointer-events-none absolute -right-20 top-1/2 h-48 w-64 -translate-y-1/2 opacity-70 sm:h-56 sm:w-76 md:-right-10 md:h-72 md:w-96 md:opacity-90 lg:right-[2%] lg:h-90 lg:w-130 lg:opacity-100">
        <GrowthGraphic className="h-full w-full" />
      </div>

      <div className="relative mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <div className="grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-10 lg:col-span-8">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="font-body text-[11px] font-medium uppercase tracking-[0.2em] text-(--kbms-ink-soft)"
            >
              Business Management &amp; Transformation Services
            </motion.p>

            <h1 className="font-display mt-4 text-[clamp(34px,5vw,64px)] font-normal leading-[1.06] tracking-tight text-(--kbms-ink)">
              <MaskedText text="Small Improvements." />
              <br />
              <MaskedText
                text="Extraordinary Results."
                delay={0.2}
                className="italic text-[#08DCDC]"
              />
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.7, ease: "easeOut" }}
              className="mt-5 max-w-lg font-body text-sm leading-relaxed text-(--kbms-ink-soft) md:text-base"
            >
              We build stronger systems, smarter operations and sustainable
              growth.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.85, ease: "easeOut" }}
              className="mt-7 flex flex-wrap items-center gap-6"
            >
              <a
                href="#contact"
                className="kbms-glass group inline-flex items-center gap-2 px-7 py-3.5 font-body text-sm font-medium text-(--kbms-bg) transition-colors hover:bg-[#08DCDC] hover:text-(--kbms-ink)"
              >
                Start a Conversation
                <span className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </a>
              <a
                href="#how-we-work"
                className="group inline-flex items-center gap-2 border-b border-(--kbms-ink)/30 pb-1 font-body text-sm font-medium text-(--kbms-ink) transition-colors hover:border-(--kbms-ink)"
              >
                Explore Our Services
              </a>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
