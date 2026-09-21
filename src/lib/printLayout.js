"use strict";

/**
 * Print layouts — a paper with positioned pieces (text, logo, line, items
 * table). Units: millimetres for position/size, points for font size. The
 * designer edits these, the print pages draw them, so what you see while
 * designing is what prints.
 */
const PAPER_SIZE = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
  THERMAL80: { w: 80, h: 200 },
  THERMAL58: { w: 58, h: 160 },
};

const TOKENS = {
  slip: [
    ["facility", "Facility name"], ["address", "Address"], ["phone", "Facility phone"], ["gstin", "GSTIN"],
    ["patient", "Patient name"], ["age", "Age"], ["gender", "Gender"], ["phone_patient", "Patient phone"],
    ["token", "Token number"], ["reason", "Reason for visit"], ["date", "Date"], ["time", "Time"], ["fee", "Fee paid"], ["footer", "Footer text (Branding)"],
  ],
  invoice: [
    ["facility", "Facility name"], ["address", "Address"], ["phone", "Facility phone"], ["gstin", "GSTIN"],
    ["bill_to", "Customer / patient name"], ["bill_to_phone", "Customer phone"], ["invoice_no", "Invoice number"],
    ["issue_date", "Date"], ["status", "Status (Paid / Due)"], ["subtotal", "Subtotal"], ["discount", "Discount"],
    ["total", "Total"], ["paid", "Paid"], ["balance", "Balance due"], ["currency", "Currency sign"], ["footer", "Footer text (Branding)"],
  ],
};

let seq = 0;
const id = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;
const T = (o) => ({ id: id(), type: "text", x: 0, y: 0, w: 60, h: 0, text: "", fontSize: 10, bold: false, italic: false, align: "left", color: "#111111", bg: "", padding: 0, visible: true, ...o });
const LINE = (o) => ({ id: id(), type: "line", x: 0, y: 0, w: 100, h: 0, color: "#111111", thickness: 0.4, visible: true, ...o });
const LOGO = (o) => ({ id: id(), type: "logo", x: 0, y: 0, w: 30, h: 30, visible: true, ...o });
const TABLE = (o) => ({
  id: id(), type: "table", x: 8, y: 100, w: 190, fontSize: 9, color: "#111111", headerBg: "", headerColor: "#111111",
  cols: { qty: true, unit: true, amount: true }, totals: true, visible: true, ...o,
});

const PRESETS = {
  slip: {
    parcha: {
      label: "Typical parcha (with Rx space)",
      paper: "A5",
      build: () => [
        LOGO({ x: 8, y: 8, w: 22, h: 22 }),
        T({ x: 8, y: 9, w: 132, text: "{facility}", fontSize: 17, bold: true, align: "center" }),
        T({ x: 8, y: 18, w: 132, text: "{address}", fontSize: 8, align: "center", color: "#555555" }),
        T({ x: 8, y: 23, w: 132, text: "{phone}", fontSize: 8, align: "center", color: "#555555" }),
        LINE({ x: 8, y: 33, w: 132, thickness: 0.7 }),
        T({ x: 8, y: 37, w: 90, text: "Name: {patient}", fontSize: 11, bold: true }),
        T({ x: 100, y: 35, w: 40, text: "Token {token}", fontSize: 14, bold: true, align: "right" }),
        T({ x: 8, y: 45, w: 90, text: "Age / Sex: {age} / {gender}", fontSize: 10 }),
        T({ x: 100, y: 45, w: 40, text: "{date}", fontSize: 10, align: "right" }),
        T({ x: 8, y: 52, w: 90, text: "Phone: {phone_patient}", fontSize: 10 }),
        T({ x: 8, y: 59, w: 132, text: "Complaint: {reason}", fontSize: 10 }),
        LINE({ x: 8, y: 67, w: 132 }),
        T({ x: 8, y: 70, w: 20, text: "℞", fontSize: 30, bold: true }),
        LINE({ x: 8, y: 186, w: 132 }),
        T({ x: 8, y: 189, w: 70, text: "Fee paid: ₹{fee}", fontSize: 10, bold: true }),
        T({ x: 8, y: 196, w: 132, text: "{footer}", fontSize: 8, align: "center", color: "#555555" }),
      ],
    },
    boxed: {
      label: "Boxed header (clean)",
      paper: "A5",
      build: () => [
        T({ x: 0, y: 0, w: 148, h: 24, text: "{facility}\n{address} · {phone}", fontSize: 13, bold: true, align: "center", bg: "#1f2937", color: "#ffffff", padding: 4 }),
        T({ x: 8, y: 30, w: 60, h: 16, text: "TOKEN\n{token}", fontSize: 15, bold: true, align: "center", bg: "#f3f4f6", padding: 2 }),
        T({ x: 72, y: 30, w: 68, text: "Patient: {patient}\nAge/Sex: {age} / {gender}\nPhone: {phone_patient}", fontSize: 10 }),
        T({ x: 8, y: 52, w: 132, text: "Date: {date}   Time: {time}", fontSize: 9, color: "#555555" }),
        T({ x: 8, y: 59, w: 132, text: "Reason: {reason}", fontSize: 10 }),
        LINE({ x: 8, y: 68, w: 132 }),
        T({ x: 8, y: 72, w: 20, text: "℞", fontSize: 28, bold: true }),
        T({ x: 8, y: 196, w: 132, text: "Fee paid: ₹{fee}    {footer}", fontSize: 9, align: "center" }),
      ],
    },
    compact: {
      label: "Compact slip (A6)",
      paper: "A6",
      build: () => [
        T({ x: 6, y: 6, w: 93, text: "{facility}", fontSize: 13, bold: true, align: "center" }),
        T({ x: 6, y: 13, w: 93, text: "{address}", fontSize: 7, align: "center", color: "#555555" }),
        LINE({ x: 6, y: 20, w: 93, thickness: 0.6 }),
        T({ x: 6, y: 24, w: 93, text: "TOKEN {token}", fontSize: 20, bold: true, align: "center" }),
        T({ x: 6, y: 40, w: 93, text: "{patient}", fontSize: 12, bold: true, align: "center" }),
        T({ x: 6, y: 48, w: 93, text: "{age} y · {gender} · {phone_patient}", fontSize: 9, align: "center" }),
        T({ x: 6, y: 56, w: 93, text: "{reason}", fontSize: 9, align: "center", color: "#555555" }),
        LINE({ x: 6, y: 66, w: 93 }),
        T({ x: 6, y: 69, w: 93, text: "{date} {time}   Fee ₹{fee}", fontSize: 8, align: "center" }),
        T({ x: 6, y: 76, w: 93, text: "{footer}", fontSize: 7, align: "center", color: "#555555" }),
      ],
    },
    thermal: {
      label: "Thermal token slip (80 mm)",
      paper: "THERMAL80",
      build: () => [
        T({ x: 3, y: 3, w: 74, text: "{facility}", fontSize: 12, bold: true, align: "center" }),
        T({ x: 3, y: 10, w: 74, text: "{address}", fontSize: 7, align: "center" }),
        LINE({ x: 3, y: 17, w: 74 }),
        T({ x: 3, y: 20, w: 74, text: "TOKEN", fontSize: 9, align: "center" }),
        T({ x: 3, y: 25, w: 74, text: "{token}", fontSize: 34, bold: true, align: "center" }),
        T({ x: 3, y: 45, w: 74, text: "{patient}", fontSize: 11, bold: true, align: "center" }),
        T({ x: 3, y: 52, w: 74, text: "{age} y · {gender}", fontSize: 9, align: "center" }),
        T({ x: 3, y: 58, w: 74, text: "{date} {time}", fontSize: 8, align: "center" }),
        T({ x: 3, y: 64, w: 74, text: "Fee ₹{fee}", fontSize: 9, align: "center" }),
        T({ x: 3, y: 71, w: 74, text: "{footer}", fontSize: 7, align: "center" }),
      ],
    },
  },
  invoice: {
    classic: {
      label: "Classic invoice (logo, summary bar)",
      paper: "A4",
      build: () => [
        T({ x: 8, y: 6, w: 100, text: "Invoice", fontSize: 24 }),
        LOGO({ x: 152, y: 8, w: 50, h: 40 }),
        T({ x: 8, y: 54, w: 190, text: "{facility} · {address} · {phone}", fontSize: 9, color: "#777777" }),
        T({ x: 8, y: 64, w: 90, text: "BILL TO", fontSize: 10, bold: true }),
        T({ x: 8, y: 70, w: 90, text: "{bill_to}\n{bill_to_phone}", fontSize: 10 }),
        T({ x: 130, y: 66, w: 40, text: "Invoice No.:\nIssue date:\nStatus:", fontSize: 9 }),
        T({ x: 165, y: 66, w: 33, text: "{invoice_no}\n{issue_date}\n{status}", fontSize: 9, bold: true, align: "right" }),
        T({ x: 7, y: 90, w: 44, h: 15, text: "Invoice No.\n{invoice_no}", fontSize: 11, bg: "#a8aaa4", color: "#ffffff", padding: 3 }),
        T({ x: 52, y: 90, w: 46, h: 15, text: "Issue date\n{issue_date}", fontSize: 11, bg: "#a8aaa4", color: "#ffffff", padding: 3 }),
        T({ x: 99, y: 90, w: 44, h: 15, text: "Status\n{status}", fontSize: 11, bg: "#a8aaa4", color: "#ffffff", padding: 3 }),
        T({ x: 144, y: 90, w: 59, h: 15, text: "Total due ({currency})\n{balance}", fontSize: 12, bg: "#3b3b3b", color: "#ffffff", padding: 3 }),
        TABLE({ x: 7, y: 114, w: 196, fontSize: 9 }),
        LINE({ x: 7, y: 272, w: 196, thickness: 0.5 }),
        T({ x: 7, y: 275, w: 100, text: "{facility}\n{address}", fontSize: 8 }),
        T({ x: 110, y: 275, w: 93, text: "{phone}\nGSTIN {gstin}", fontSize: 8, align: "right" }),
      ],
    },
    simple: {
      label: "Simple bill (plain)",
      paper: "A4",
      build: () => [
        T({ x: 10, y: 10, w: 190, text: "{facility}", fontSize: 20, bold: true, align: "center" }),
        T({ x: 10, y: 20, w: 190, text: "{address}\n{phone}   GSTIN {gstin}", fontSize: 9, align: "center", color: "#555555" }),
        LINE({ x: 10, y: 34, w: 190, thickness: 0.8 }),
        T({ x: 10, y: 38, w: 100, text: "Bill to: {bill_to}\nPhone: {bill_to_phone}", fontSize: 10 }),
        T({ x: 120, y: 38, w: 80, text: "Invoice: {invoice_no}\nDate: {issue_date}\nStatus: {status}", fontSize: 10, align: "right" }),
        TABLE({ x: 10, y: 60, w: 190, headerBg: "#f3f4f6", fontSize: 10 }),
        T({ x: 10, y: 275, w: 190, text: "{footer}", fontSize: 9, align: "center", color: "#555555" }),
      ],
    },
    half: {
      label: "Half-page bill (A5)",
      paper: "A5",
      build: () => [
        T({ x: 8, y: 8, w: 132, text: "{facility}", fontSize: 15, bold: true, align: "center" }),
        T({ x: 8, y: 16, w: 132, text: "{address} · {phone}", fontSize: 8, align: "center", color: "#555555" }),
        LINE({ x: 8, y: 24, w: 132, thickness: 0.6 }),
        T({ x: 8, y: 27, w: 70, text: "{bill_to}\n{bill_to_phone}", fontSize: 9 }),
        T({ x: 80, y: 27, w: 60, text: "No. {invoice_no}\n{issue_date}", fontSize: 9, align: "right" }),
        TABLE({ x: 8, y: 42, w: 132, fontSize: 8, headerBg: "#f3f4f6" }),
        T({ x: 8, y: 198, w: 132, text: "{footer}", fontSize: 8, align: "center", color: "#555555" }),
      ],
    },
    thermal: {
      label: "Thermal receipt (80 mm)",
      paper: "THERMAL80",
      build: () => [
        T({ x: 3, y: 3, w: 74, text: "{facility}", fontSize: 12, bold: true, align: "center" }),
        T({ x: 3, y: 10, w: 74, text: "{address}\n{phone}", fontSize: 7, align: "center" }),
        LINE({ x: 3, y: 22, w: 74 }),
        T({ x: 3, y: 25, w: 74, text: "Bill {invoice_no}\n{issue_date}\n{bill_to}", fontSize: 8 }),
        TABLE({ x: 3, y: 42, w: 74, fontSize: 8, cols: { qty: true, unit: false, amount: true } }),
        T({ x: 3, y: 130, w: 74, text: "{footer}\nThank you", fontSize: 7, align: "center" }),
      ],
    },
  },
};

function presetLayout(kind, key) {
  const p = PRESETS[kind][key] || PRESETS[kind][Object.keys(PRESETS[kind])[0]];
  const size = PAPER_SIZE[p.paper];
  return { paper: p.paper, h: size.h, elements: p.build() };
}

/** Change paper: keep positions proportional so nothing falls off the page. */
function rescaleLayout(layout, paper) {
  const from = PAPER_SIZE[layout.paper];
  const to = PAPER_SIZE[paper];
  const fx = to.w / from.w;
  const fy = to.h / from.h;
  const r = (n) => Math.round(n * 10) / 10;
  return {
    paper,
    h: to.h,
    elements: layout.elements.map((e) => ({ ...e, x: r(e.x * fx), y: r(e.y * fy), w: e.w ? r(e.w * fx) : e.w, h: e.h ? r(e.h * fy) : e.h })),
  };
}

function resolveText(str, data) {
  return String(str || "").replace(/\{(\w+)\}/g, (_, k) => (data[k] === undefined || data[k] === null ? "" : String(data[k])));
}

const clamp = (v, a, b, d) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);
const color = (v) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : "");

/** Never trust a saved / submitted layout: keep only known fields inside sane ranges. */
function sanitizeLayout(input) {
  if (!input || typeof input !== "object" || !PAPER_SIZE[input.paper] || !Array.isArray(input.elements)) return null;
  const size = PAPER_SIZE[input.paper];
  const els = [];
  for (const e of input.elements.slice(0, 60)) {
    if (!e || !["text", "line", "logo", "table"].includes(e.type)) continue;
    const base = { id: String(e.id || id()).slice(0, 24), type: e.type, x: clamp(e.x, -10, 400, 0), y: clamp(e.y, -10, 700, 0), w: clamp(e.w, 1, 400, 40), visible: e.visible !== false };
    if (e.type === "text") {
      els.push({ ...base, h: clamp(e.h, 0, 400, 0), text: String(e.text || "").slice(0, 600), fontSize: clamp(e.fontSize, 5, 72, 10), bold: !!e.bold, italic: !!e.italic, align: ["left", "center", "right"].includes(e.align) ? e.align : "left", color: color(e.color) || "#111111", bg: color(e.bg), padding: clamp(e.padding, 0, 20, 0), belowTable: !!e.belowTable });
    } else if (e.type === "line") {
      els.push({ ...base, h: 0, color: color(e.color) || "#111111", thickness: clamp(e.thickness, 0.1, 3, 0.4) });
    } else if (e.type === "logo") {
      els.push({ ...base, h: clamp(e.h, 1, 200, 30) });
    } else {
      els.push({ ...base, fontSize: clamp(e.fontSize, 5, 20, 9), color: color(e.color) || "#111111", headerBg: color(e.headerBg), headerColor: color(e.headerColor) || "#111111", cols: { qty: e.cols?.qty !== false, unit: e.cols?.unit !== false, amount: e.cols?.amount !== false }, totals: e.totals !== false });
    }
  }
  return { paper: input.paper, h: clamp(input.h, 40, 700, size.h), elements: els };
}

module.exports = { PAPER_SIZE, TOKENS, PRESETS, presetLayout, rescaleLayout, resolveText, sanitizeLayout, T, LINE, LOGO, TABLE };
