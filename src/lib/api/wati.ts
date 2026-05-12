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

  // WATI returns 200 even on logical failures — only treat an EXPLICIT
  // false flag as failure; everything else (including {}/non-JSON) is success.
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (
      parsed &&
      (parsed.result === false || parsed.ok === false || parsed.success === false)
    ) {
      throw new Error(`WATI send rejected: ${raw.slice(0, 300)}`);
    }
  } catch (err) {
    // JSON parse failures are fine — the upstream returned non-JSON success.
    if (err instanceof Error && err.message.startsWith("WATI send rejected")) {
      throw err;
    }
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
