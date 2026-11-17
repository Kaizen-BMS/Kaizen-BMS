"use strict";

const nodemailer = require("nodemailer");

/**
 * Gmail SMTP transport for patient OTP delivery. Credentials come only
 * from process.env â€” never hardcoded, never logged (not even on a send
 * failure; the error itself may echo back the auth attempt, so only its
 * message is logged, not the credential values, which were never read
 * into a loggable variable in the first place).
 *
 * EMAIL_APP_PASSWORD must be a Gmail App Password (16 chars, from Google
 * Account -> Security -> 2-Step Verification -> App Passwords) â€” a normal
 * Gmail login password will not authenticate here even if correct, Gmail
 * rejects plain-password SMTP auth entirely.
 */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("EMAIL_USER / EMAIL_APP_PASSWORD not configured â€” cannot send email");
  }
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

function otpEmailHtml(code) {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 420px; margin: 0 auto; color: #111;">
      <p style="font-size: 14px; color: #555;">Your Kaizen BMS login code is:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 16px 0; text-align: center;">${code}</p>
      <p style="font-size: 13px; color: #777;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `.trim();
}

function otpEmailText(code) {
  return `Your Kaizen BMS login code is: ${code}\n\nThis code expires in 5 minutes. If you didn't request this, you can safely ignore this email.`;
}

/** Send a 6-digit OTP code to a patient's email. Throws on failure â€” callers decide how to handle it. */
async function sendOtpEmail(toEmail, code) {
  const t = getTransporter();
  await t.sendMail({
    from: `"Kaizen BMS" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Your Kaizen BMS login code",
    text: otpEmailText(code),
    html: otpEmailHtml(code),
  });
}


/** Password reset link email. Throws on failure â€” the caller must not reveal that to the requester. */
async function sendPasswordResetEmail(toEmail, link) {
  const t = getTransporter();
  await t.sendMail({
    from: `"Kaizen BMS" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Reset your Kaizen BMS password",
    text: `Use this link to choose a new password (valid for 30 minutes):

${link}

If you did not ask for this, ignore this email â€” your password is unchanged.`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;color:#111"><p>Use the button below to choose a new password. The link is valid for 30 minutes.</p><p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Reset password</a></p><p style="font-size:13px;color:#777">If you did not ask for this, ignore this email â€” your password is unchanged.</p></div>`,
  });
}

function partnerSalesReportHtml({ fromTenantName, toTenantName, date, items, totalQuantity, totalAmount }) {
  const rows = items
    .map(
      (it) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${it.medicineName}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${it.quantity}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${it.amount != null ? `â‚¹${it.amount}` : "â€”"}</td></tr>`,
    )
    .join("");
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <p style="font-size: 14px; color: #555;">Daily partner pharmacy sales report from <b>${fromTenantName}</b> for <b>${toTenantName}</b> â€” ${date}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        <thead><tr style="text-align:left;color:#777"><th style="padding:4px 8px;border-bottom:2px solid #ddd">Medicine</th><th style="padding:4px 8px;border-bottom:2px solid #ddd;text-align:right">Qty</th><th style="padding:4px 8px;border-bottom:2px solid #ddd;text-align:right">Amount</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" style="padding:8px;color:#999">No orders fulfilled this day.</td></tr>`}</tbody>
        <tfoot><tr style="font-weight:600"><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right">${totalQuantity}</td><td style="padding:6px 8px;text-align:right">${totalAmount ? `â‚¹${totalAmount}` : "â€”"}</td></tr></tfoot>
      </table>
      <p style="font-size: 12px; color: #999; margin-top: 16px;">Sent from Kaizen BMS on behalf of ${fromTenantName}.</p>
    </div>
  `.trim();
}

/** Share one day's partner-connection pharmacy sales with the connected (requester) hospital's owner. Throws on failure â€” the caller decides how to surface that. */
async function sendPartnerSalesReportEmail(toEmail, report) {
  const t = getTransporter();
  await t.sendMail({
    from: `"Kaizen BMS" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Partner pharmacy sales â€” ${report.fromTenantName} â€” ${report.date}`,
    html: partnerSalesReportHtml(report),
  });
}

module.exports = { sendOtpEmail, sendPasswordResetEmail, sendPartnerSalesReportEmail };
