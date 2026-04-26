/**
 * Email fallback transport.
 *
 * Uses Resend (https://resend.com) if RESEND_API_KEY is set.
 * Returns immediately when no provider is configured — caller
 * decides whether that's a failure or a no-op.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "alerts@hakikat.local";

export interface EmailResult {
  ok: boolean;
  configured: boolean;
  error?: string;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    return { ok: false, configured: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, configured: true, error: `Resend ${res.status}: ${err}` };
    }
    return { ok: true, configured: true };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err instanceof Error ? err.message : "send failed",
    };
  }
}
