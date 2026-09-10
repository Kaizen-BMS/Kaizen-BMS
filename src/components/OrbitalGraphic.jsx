"use client";

import { motion } from "framer-motion";
import { CyanBlob, Crosshair, NodeDot } from "./graphics/primitives";

/**
 * The hero visual: a soft cyan organic shape sitting behind a system of thin
 * orbital rings, drifting nodes and connecting lines — "people + systems +
 * technology + growth" rendered abstractly. Everything here is custom SVG /
 * CSS, nothing borrowed from an icon set.
 */
export default function OrbitalGraphic({ className = "" }) {
  return (
    <div className={`relative select-none ${className}`} aria-hidden="true">
      {/* cyan organic field, very slow morph + float */}
      <div className="absolute inset-0 kbms-float">
        <CyanBlob className="h-full w-full" opacity={0.55} />
      </div>

      {/* orbital rings, slow independent rotation */}
      <motion.svg
        viewBox="0 0 600 600"
        className="absolute inset-0 h-full w-full"
        style={{ transformOrigin: "300px 300px" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx="300"
          cy="300"
          r="230"
          fill="none"
          stroke="var(--kbms-ink)"
          strokeOpacity="0.12"
          strokeWidth="1"
        />
        <circle
          cx="300"
          cy="300"
          r="170"
          fill="none"
          stroke="var(--kbms-ink)"
          strokeOpacity="0.18"
          strokeWidth="1"
          strokeDasharray="1 7"
        />
        <circle cx="70" cy="300" r="4" fill="#08DCDC" />
        <circle
          cx="300"
          cy="70"
          r="3"
          fill="var(--kbms-ink)"
          fillOpacity="0.6"
        />
      </motion.svg>

      <motion.svg
        viewBox="0 0 600 600"
        className="absolute inset-0 h-full w-full"
        style={{ transformOrigin: "300px 300px" }}
        animate={{ rotate: -360 }}
        transition={{ duration: 130, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx="300"
          cy="300"
          r="120"
          fill="none"
          stroke="var(--kbms-ink)"
          strokeOpacity="0.15"
          strokeWidth="1"
        />
        <circle cx="420" cy="300" r="3.5" fill="#6E5BFF" />
      </motion.svg>

      {/* connecting lines + fixed nodes, representing systems linking together */}
      <svg viewBox="0 0 600 600" className="absolute inset-0 h-full w-full">
        <line
          x1="150"
          y1="140"
          x2="300"
          y2="300"
          stroke="var(--kbms-ink)"
          strokeOpacity="0.15"
          strokeWidth="1"
        />
        <line
          x1="460"
          y1="180"
          x2="300"
          y2="300"
          stroke="var(--kbms-ink)"
          strokeOpacity="0.15"
          strokeWidth="1"
        />
        <line
          x1="220"
          y1="470"
          x2="300"
          y2="300"
          stroke="var(--kbms-ink)"
          strokeOpacity="0.15"
          strokeWidth="1"
        />
        <circle
          cx="150"
          cy="140"
          r="3"
          fill="var(--kbms-ink)"
          fillOpacity="0.5"
        />
        <circle cx="460" cy="180" r="3" fill="#08DCDC" />
        <circle
          cx="220"
          cy="470"
          r="3"
          fill="var(--kbms-ink)"
          fillOpacity="0.5"
        />
        <circle cx="300" cy="300" r="5" fill="#08DCDC" />
      </svg>

      <Crosshair
        size={18}
        className="absolute right-[12%] top-[18%] opacity-70"
      />
      <NodeDot r={3} className="absolute bottom-[22%] left-[16%]" />
    </div>
  );
}
