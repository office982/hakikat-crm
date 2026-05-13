const WATI_API_KEY = process.env.WATI_API_KEY;
const WATI_BASE_URL = process.env.WATI_BASE_URL;

export interface WatiMessage {
  from: string;
  text: string;
  timestamp: string;
  contact_name?: string;
}

function assertConfigured() {
  if (!WATI_API_KEY || !WATI_BASE_URL) {
    throw new Error("WATI credentials not configured");
  }
}

function authHeader(): Record<string, string> {
  const key = WATI_API_KEY || "";
  // WATI accepts either a raw token or "Bearer <token>" — normalise.
  const value = key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`;
  return { Authorization: value };
}

function normalisePhone(phone: string): string {
  // WATI expects digits only (e.g. 972501234567). Strip + and spaces.
  return phone.replace(/[^\d]/g, "");
}

/**
 * Send a free-text WhatsApp session message via WATI.
 *
 * WATI v1 `sendSessionMessage` takes `messageText` as a query parameter, not
 * a JSON body. The v2 endpoint accepts a body. We send to v1 with the query
 * param — this is the format that works against all current WATI tenants.
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<void> {
  assertConfigured();

  const cleanPhone = normalisePhone(phone);
  const url =
    `${WATI_BASE_URL}/api/v1/sendSessionMessage/${cleanPhone}` +
    `?messageText=${encodeURIComponent(message)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`WATI send error ${response.status}: ${raw.slice(0, 300)}`);
  }

  // WATI returns 200 even when Meta refuses delivery. The outer envelope
  // (`result: "success"`) only confirms WATI received our request — the
  // inner `message.statusString` reflects WhatsApp delivery.
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return; // non-JSON 200 — treat as success
  }

  if (!parsed || typeof parsed !== "object") return;
  const p = parsed as Record<string, unknown>;

  const innerStatusString =
    p.message && typeof p.message === "object"
      ? (p.message as Record<string, unknown>).statusString
      : undefined;
  const innerStatus =
    p.message && typeof p.message === "object"
      ? (p.message as Record<string, unknown>).status
      : undefined;

  const envelopeFailed =
    p.result === false || p.ok === false || p.success === false;
  const deliveryFailed =
    typeof innerStatusString === "string" &&
    innerStatusString.toUpperCase() === "FAILED";

  if (envelopeFailed || deliveryFailed) {
    const reason = deliveryFailed
      ? `WhatsApp delivery FAILED (status=${innerStatus ?? "?"}, ` +
        `statusString=${innerStatusString ?? "?"}). ` +
        `Likely cause: WATI account / Meta Business Verification not complete, ` +
        `phone-number approval pending, or recipient outside the 24h session window.`
      : `WATI envelope rejected: ${raw.slice(0, 300)}`;
    throw new Error(`WATI send rejected — ${reason}`);
  }
}

/**
 * Send a template message via WATI.
 */
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  parameters: { name: string; value: string }[]
): Promise<void> {
  assertConfigured();

  const cleanPhone = normalisePhone(phone);
  const url =
    `${WATI_BASE_URL}/api/v1/sendTemplateMessage/${cleanPhone}` +
    `?template_name=${encodeURIComponent(templateName)}` +
    `&broadcast_name=${encodeURIComponent("hakikat_crm")}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
    body: JSON.stringify({ parameters }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`WATI template error: ${response.status} — ${err}`);
  }
}
