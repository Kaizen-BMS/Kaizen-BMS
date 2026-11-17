"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import MaskedText from "./MaskedText";

export default function Hero() {
  return (
    <section
      id="home"
      className="relative overflow-hidden bg-[#0A2A43] pt-20 md:pt-24"
    >
      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-6 px-6 py-8 md:grid-cols-12 md:gap-8 md:px-10 md:py-10">
        <div className="md:col-span-7">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="font-body text-[11px] font-medium uppercase tracking-[0.2em] text-white/60"
          >
            Business Management &amp; Transformation Services
          </motion.p>

          <h1 className="font-display mt-3 text-[clamp(26px,3.8vw,46px)] font-normal leading-[1.08] tracking-tight text-white">
            <MaskedText text="Small Improvements." />
            <br />
            <MaskedText
              text="Extraordinary Results."
              delay={0.2}
              className="text-[#4ADE80]"
            />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease: "easeOut" }}
            className="mt-3 max-w-lg font-body text-sm leading-relaxed text-white/70"
          >
            We build stronger systems, smarter operations and sustainable
            growth.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.85, ease: "easeOut" }}
            className="mt-5 flex flex-wrap items-center gap-3"
          >
            <a
              href="#contact"
              className="group inline-flex items-center gap-2 rounded-full bg-[#16A34A] px-5 py-2.5 font-body text-sm font-medium text-white shadow-[0_4px_18px_rgba(22,163,74,0.35)] transition-colors hover:bg-[#15803D]"
            >
              Get Started
              <span className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </a>
            <a
              href="#how-we-work"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 font-body text-sm font-medium text-white transition-colors hover:border-white hover:bg-white/10"
            >
              Learn More
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="relative h-[180px] overflow-hidden rounded-2xl md:col-span-5 md:h-[260px]"
        >
          <Image
            src="/images/stock/hero-skyline.jpg"
            alt="A business professional looking out over a city skyline"
            fill
            priority
            sizes="(min-width: 768px) 40vw, 90vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A2A43]/30 via-transparent to-transparent" />
        </motion.div>
      </div>
    </section>
  );
}
