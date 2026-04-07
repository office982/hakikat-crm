const EASYDO_API_KEY = process.env.EASYDO_API_KEY;
const EASYDO_BASE_URL = "https://api.easydo.co.il/api/v1";

export interface EasydoSendRequest {
  document_name: string;
  signers: {
    name: string;
    phone: string;
    email?: string;
  }[];
  pdf_url?: string;
  pdf_base64?: string;
  webhook_url: string;
}

export interface EasydoWebhookEvent {
  document_id: string;
  status: "sent" | "viewed" | "signed" | "declined";
  signer_name: string;
  signer_phone: string;
  signed_pdf_url?: string;
  timestamp: string;
}

/**
 * Send a document for digital signature via EasyDo.
 */
export async function sendForSignature(request: EasydoSendRequest): Promise<{ document_id: string }> {
  if (!EASYDO_API_KEY) {
    throw new Error("EASYDO_API_KEY is not configured");
  }

  const response = await fetch(`${EASYDO_BASE_URL}/documents/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EASYDO_API_KEY}`,
    },
    body: JSON.stringify({
      name: request.document_name,
      signers: request.signers,
      file_url: request.pdf_url,
      file_base64: request.pdf_base64,
      webhook_url: request.webhook_url,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`EasyDo API error: ${response.status} — ${err}`);
  }

  return response.json();
}

/**
 * Verify webhook signature from EasyDo.
 */
export function verifyEasydoWebhook(
  body: string,
  signature: string,
  secret: string
): boolean {
  // TODO: Implement HMAC verification based on EasyDo's webhook docs
  // For now, basic check
  return !!signature && !!secret;
}
