"use client";

import { useState } from "react";
import { motion, animate } from "framer-motion";

/** Shared 0→target count-up, triggered once the number scrolls into view. */
export default function Counter({
  value,
  prefix = "",
  suffix = "",
  duration = 1.8,
}) {
  const [display, setDisplay] = useState(0);
  return (
    <motion.span
      className="kbms-num-tabular"
      onViewportEnter={() => {
        animate(0, value, {
          duration,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => setDisplay(Math.round(v)),
        });
      }}
      viewport={{ once: true, margin: "0px 0px -20% 0px" }}
    >
      {prefix}
      {display}
      {suffix}
    </motion.span>
  );
}
