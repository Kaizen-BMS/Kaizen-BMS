"use strict";

const { z } = require("zod");
const { normalizeIndianPhone } = require("./phone");
const opt = (n) => z.string().trim().max(n).optional().or(z.literal(""));

const supplierInputSchema = z.object({
  name: z.string().trim().min(1).max(191),
  companyName: opt(191),
  contactPerson: opt(191),
  phone: opt(32).transform((v) => (v ? normalizeIndianPhone(v) ?? v : v)),
  email: opt(191),
  address: opt(500),
  gstin: opt(20),
  drugLicenceNo: opt(60),
  paymentTerms: opt(100),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
});

const supplierUpdateSchema = supplierInputSchema.partial().extend({ active: z.coerce.boolean().optional() });

function serializeSupplier(s) {
  if (!s) return null;
  return {
    id: Number(s.id),
    name: s.name,
    companyName: s.company_name,
    contactPerson: s.contact_person,
    phone: s.phone,
    email: s.email,
    address: s.address,
    gstin: s.gstin,
    drugLicenceNo: s.drug_licence_no,
    paymentTerms: s.payment_terms,
    creditDays: s.credit_days,
    active: !!s.active,
  };
}

function toRow(v) {
  return {
    name: v.name,
    company_name: v.companyName || null,
    contact_person: v.contactPerson || null,
    phone: v.phone || null,
    email: v.email || null,
    address: v.address || null,
    gstin: v.gstin || null,
    drug_licence_no: v.drugLicenceNo || null,
    payment_terms: v.paymentTerms || null,
    credit_days: v.creditDays ?? null,
  };
}

module.exports = { supplierInputSchema, supplierUpdateSchema, serializeSupplier, toRow };
