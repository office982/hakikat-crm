/**
 * SMS fallback transport via Twilio.
 *
 * Activates when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
 * TWILIO_FROM_NUMBER are all set.
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;

export interface SmsResult {
  ok: boolean;
  configured: boolean;
  error?: string;
}

export async function sendSms(params: {
  to: string;
  body: string;
}): Promise<SmsResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
    return { ok: false, configured: false, error: "Twilio credentials missing" };
  }

  // Twilio expects E.164 (e.g. +972...) — coerce common formats.
  const to = params.to.startsWith("+")
    ? params.to
    : params.to.startsWith("972")
    ? `+${params.to}`
    : params.to.startsWith("0")
    ? `+972${params.to.slice(1)}`
    : `+${params.to}`;

  try {
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: TWILIO_FROM,
          To: to,
          Body: params.body,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, configured: true, error: `Twilio ${res.status}: ${err}` };
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
