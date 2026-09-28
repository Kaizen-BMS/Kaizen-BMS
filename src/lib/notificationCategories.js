"use strict";

// The code-defined catalog of toast/notification categories a person can
// individually mute — one entry per realtime event Toasts.jsx knows how to
// announce (see its own RULES object, which this mirrors key-for-key).
// Shared between the API (validates a PATCH only stores known keys) and the
// settings UI in NotificationBell.jsx (renders one checkbox per entry).
const NOTIFICATION_CATEGORIES = [
  { key: "prescription:created", label: "New prescriptions (Pharmacy)" },
  { key: "laborder:created", label: "New lab orders" },
  { key: "lab:result", label: "Lab results ready" },
  { key: "visit:created", label: "New patient in the queue" },
  { key: "appointment:booked", label: "New appointment booked" },
  { key: "radiologyorder:created", label: "New radiology orders" },
  { key: "partner:request", label: "Partner connection requests" },
  { key: "partner:inbound", label: "Orders/referrals from a partner" },
];

module.exports = { NOTIFICATION_CATEGORIES };
