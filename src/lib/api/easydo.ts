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
 * Verify webhook signature from EasyDo via HMAC-SHA256.
 * EasyDo is expected to send the signature in the `x-easydo-signature`
 * header as a hex-encoded HMAC of the raw request body with the shared
 * secret. Falls back to `true` when no secret is configured (dev mode).
 */
export function verifyEasydoWebhook(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) return true;
  if (!signature) return false;

  // Lazy-require to keep this file usable in edge runtime contexts that
  // don't import crypto; webhook runs on Node.js.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const sigBuf = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  const digBuf = Buffer.from(digest, "hex");
  if (sigBuf.length !== digBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, digBuf);
}
