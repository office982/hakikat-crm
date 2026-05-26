/**
 * Email transport via Gmail SMTP (nodemailer).
 *
 * Requires a Gmail App Password — generate at https://myaccount.google.com/apppasswords
 * (the account must have 2-Step Verification enabled). Regular account passwords
 * will be rejected by Gmail SMTP with "Application-specific password required".
 *
 * Env vars:
 *   SMTP_USER       — Gmail address (e.g. alerts@hakikat.co.il)
 *   SMTP_PASS       — 16-character App Password (no spaces)
 *   SMTP_FROM_EMAIL — optional From header; defaults to SMTP_USER
 *
 * Returns immediately when not configured — the caller decides whether
 * that's a failure or a no-op.
 */

import nodemailer, { type Transporter } from "nodemailer";

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || SMTP_USER || "alerts@hakikat.local";

export interface EmailResult {
  ok: boolean;
  configured: boolean;
  error?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!SMTP_USER || !SMTP_PASS) return null;
  if (transporter) return transporter;
  // Gmail submission endpoint. Port 587 + STARTTLS is preferred over 465/SSL —
  // nodemailer's `service: "gmail"` shortcut wires both correctly.
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailResult> {
  const t = getTransporter();
  if (!t) {
    return { ok: false, configured: false, error: "SMTP_USER/SMTP_PASS not configured" };
  }

  try {
    await t.sendMail({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    return { ok: true, configured: true };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err instanceof Error ? err.message : "send failed",
    };
  }
}
