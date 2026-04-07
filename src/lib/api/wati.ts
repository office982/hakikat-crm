const WATI_API_KEY = process.env.WATI_API_KEY;
const WATI_BASE_URL = process.env.WATI_BASE_URL;

export interface WatiMessage {
  from: string;
  text: string;
  timestamp: string;
  contact_name?: string;
}

/**
 * Send a WhatsApp message via WATI.
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<void> {
  if (!WATI_API_KEY || !WATI_BASE_URL) {
    throw new Error("WATI credentials not configured");
  }

  const response = await fetch(`${WATI_BASE_URL}/api/v1/sendSessionMessage/${phone}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WATI_API_KEY}`,
    },
    body: JSON.stringify({
      messageText: message,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`WATI API error: ${response.status} — ${err}`);
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
  if (!WATI_API_KEY || !WATI_BASE_URL) {
    throw new Error("WATI credentials not configured");
  }

  const response = await fetch(`${WATI_BASE_URL}/api/v1/sendTemplateMessage/${phone}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WATI_API_KEY}`,
    },
    body: JSON.stringify({
      template_name: templateName,
      broadcast_name: "hakikat_crm",
      parameters,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`WATI template error: ${response.status} — ${err}`);
  }
}
