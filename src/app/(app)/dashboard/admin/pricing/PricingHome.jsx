"use client";

import { useState } from "react";
import SimplePriceList from "./SimplePriceList";
import PricingClient from "./PricingClient";

// The price list, in plain words. The detailed version (patient categories,
// price history, tax split) is one click away for those who need it.
export default function PricingHome() {
  const [advanced, setAdvanced] = useState(false);
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Price list</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            What you charge for — consultation, tests, procedures, medicines. Bills take their prices from here. If you change a price later, bills that are already made keep the old price.
          </p>
        </div>
        <button onClick={() => setAdvanced((a) => !a)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">{advanced ? "Back to simple view" : "Advanced view"}</button>
      </div>
      {advanced ? <PricingClient /> : <SimplePriceList />}
    </div>
  );
}
