// Sample values so the designer / test print show a realistic page.
export const SAMPLE_SLIP = { patient: "Sample Patient", age: 34, gender: "Female", phone_patient: "98XXXXXX10", token: 12, reason: "Fever since 2 days", date: "21 Sep 2026", time: "10:30 AM", fee: "300" };
export const SAMPLE_INVOICE = { bill_to: "Sample Customer", bill_to_phone: "98XXXXXX10", invoice_no: "INV-0001-000123", issue_date: "21 Sep 2026", status: "Due", subtotal: "1,250.00", discount: "50.00", total: "1,200.00", paid: "200.00", balance: "1,000.00", currency: "₹" };
export const SAMPLE_ITEMS = [
  { description: "Consultation", qty: 1, unit: 500, amount: 500 },
  { description: "Paracetamol 500mg", qty: 10, unit: 2, amount: 20 },
  { description: "CBC test", qty: 1, unit: 730, amount: 730 },
];
export const SAMPLE_TOTALS = { subtotal: 1250, discount: 50, total: 1200, paid: 200, balance: 1000 };
