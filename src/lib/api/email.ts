/**
 * Email transport via Gmail SMTP (nodemailer) with a Supabase-backed retry queue.
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
 * Failed sends are persisted to the `pending_emails` table and retried every
 * 5 minutes by the loop started in `src/instrumentation.ts`. Retry uses
 * exponential backoff (5m × 2^attempts) and gives up after 8 attempts.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase";

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || SMTP_USER || "alerts@hakikat.local";

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 5 * 60 * 1000;

export interface EmailResult {
  ok: boolean;
  configured: boolean;
  error?: string;
  /** ID of the row created in `pending_emails` when send fails and is queued. */
  queued_id?: string;
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

interface SendParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function rawSend(p: SendParams): Promise<EmailResult> {
  const t = getTransporter();
  if (!t) {
    return { ok: false, configured: false, error: "SMTP_USER/SMTP_PASS not configured" };
  }
  try {
    await t.sendMail({
      from: FROM_EMAIL,
      to: p.to,
      subject: p.subject,
      text: p.text,
      html: p.html,
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

/**
 * Send an email immediately. On failure (any reason — SMTP unconfigured,
 * network error, Gmail rejection), persist the message to `pending_emails`
 * so the retry loop picks it up. `queued_id` is set when queuing succeeded.
 */
export async function sendEmail(p: SendParams): Promise<EmailResult> {
  const result = await rawSend(p);
  if (result.ok) return result;

  // Best-effort queue insert. If this also fails we just log — the caller
  // already knows the immediate send failed.
  try {
    const { data, error } = await supabaseAdmin
      .from("pending_emails")
      .insert({
        to_email: p.to,
        subject: p.subject,
        body_text: p.text,
        body_html: p.html ?? null,
        last_error: result.error ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[email] failed to queue for retry", { error: error.message });
      return result;
    }
    return { ...result, queued_id: data.id as string };
  } catch (err) {
    console.warn("[email] failed to queue for retry", { error: String(err) });
    return result;
  }
}

/**
 * Process one batch of due `pending_emails`. Called periodically by the
 * retry loop. Each row gets one send attempt; failures get rescheduled with
 * exponential backoff up to MAX_ATTEMPTS, after which the row is marked
 * `failed` and ignored.
 */
export async function processPendingEmails(limit = 20): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("pending_emails")
    .select("id, to_email, subject, body_text, body_html, attempts")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[email] retry-loop select failed", { error: error.message });
    return { processed: 0, sent: 0, failed: 0 };
  }
  if (!rows?.length) return { processed: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const r = await rawSend({
      to: row.to_email,
      subject: row.subject,
      text: row.body_text,
      html: row.body_html ?? undefined,
    });
    const attempts = (row.attempts ?? 0) + 1;

    if (r.ok) {
      await supabaseAdmin
        .from("pending_emails")
        .update({
          status: "sent",
          attempts,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);
      sent++;
      continue;
    }

    if (attempts >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .from("pending_emails")
        .update({
          status: "failed",
          attempts,
          last_error: r.error ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed++;
      continue;
    }

    // Exponential backoff: 5m, 10m, 20m, 40m, ... capped by MAX_ATTEMPTS.
    const delayMs = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
    await supabaseAdmin
      .from("pending_emails")
      .update({
        attempts,
        last_error: r.error ?? null,
        next_retry_at: new Date(Date.now() + delayMs).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  return { processed: rows.length, sent, failed };
}
