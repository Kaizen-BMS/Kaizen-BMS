"use client";

import { motion } from "framer-motion";
import { CyanBlob } from "./graphics/primitives";
import MaskedText from "./MaskedText";

export default function CTA({
  id = "cta",
  headline = "Ready to make the next improvement?",
  supporting = "Let's find what's holding you back — and build the path forward.",
  primaryLabel = "Book a Consultation",
  primaryHref = "#contact",
  secondaryLabel = "Explore Services",
  secondaryHref = "#how-we-work",
}) {
  return (
    <section
      id={id}
      className="relative flex min-h-[42vh] items-center overflow-hidden bg-[#080808] py-16 md:py-20"
    >
      <div className="pointer-events-none absolute -left-32 top-1/2 h-[440px] w-[440px] -translate-y-1/2 kbms-float md:-left-16">
        <CyanBlob className="h-full w-full" opacity={0.24} />
      </div>
      <div className="pointer-events-none absolute -right-32 bottom-[-140px] h-[340px] w-[340px] kbms-float">
        <CyanBlob className="h-full w-full" opacity={0.16} />
      </div>

      <div className="relative mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(28px,3.6vw,46px)] font-normal leading-[1.12] tracking-tight text-[#FAFAF7]">
            <MaskedText text={headline} />
          </h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="font-body mt-5 max-w-md text-sm leading-relaxed text-[#FAFAF7]/70 md:text-base"
          >
            {supporting}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{ duration: 0.6, delay: 0.65 }}
            className="mt-7 flex flex-wrap items-center gap-5"
          >
            <a
              href={primaryHref}
              className="kbms-glass-invert group inline-flex items-center gap-2 px-7 py-3.5 font-body text-sm font-medium text-[#FAFAF7] transition-colors hover:bg-[#08DCDC] hover:text-[#080808] hover:border-[#08DCDC]"
            >
              {primaryLabel}
              <span className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </a>
            {secondaryLabel && (
              <a
                href={secondaryHref}
                className="group inline-flex items-center gap-2 border-b border-[#FAFAF7]/40 pb-1 font-body text-sm font-medium text-[#FAFAF7] transition-colors hover:border-[#08DCDC] hover:text-[#08DCDC]"
              >
                {secondaryLabel}
                <span className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </a>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
