// EasyDo digital signature integration.
//
// Three-step "random document" flow per EasyDo's API:
//   1. POST /api/entity/me/forms                            -> form id
//   2. POST /api/entity/me/forms/{id}/assignees             -> recipients
//   3. POST /api/entity/me/forms/{id}/upload                -> base64 PDF
//
// Auth is OAuth client-credentials: exchange CLIENT_ID + CLIENT_SECRET
// for a short-lived Bearer token via /api/auth/token. The token is
// cached in-process until ~1 minute before expiry.
//
// Webhook is configured globally in the EasyDo dashboard (API Client
// settings) — not per-request.

const AUTH_BASE = "https://api.easydo.co.il";
const API_BASE = "https://api.easydoc.co.il";

interface TokenResponse {
  access_token: string;
  expires_in?: number;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

export function isEasydoConfigured(): boolean {
  return !!(process.env.EASYDO_CLIENT_ID && process.env.EASYDO_CLIENT_SECRET);
}

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const clientId = process.env.EASYDO_CLIENT_ID;
  const clientSecret = process.env.EASYDO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EasyDo not configured (EASYDO_CLIENT_ID + EASYDO_CLIENT_SECRET required)");
  }

  const res = await fetch(`${AUTH_BASE}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // EasyDo's auth body uses hyphenated keys, not snake/camelCase.
    body: JSON.stringify({ "client-id": clientId, "client-secret": clientSecret }),
  });
  if (!res.ok) {
    throw new Error(`EasyDo auth failed: ${res.status} — ${await res.text()}`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error("EasyDo auth response missing access_token");
  }
  // expires_in is in seconds; default to 1h if absent.
  const ttlMs = (data.expires_in ?? 3600) * 1000;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttlMs };
  return data.access_token;
}

async function easydoFetch(path: string, body: unknown): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`EasyDo ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export interface EasydoSigner {
  name: string;
  email?: string;
  phone?: string;
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
 * Send a PDF for digital signature via EasyDo's three-step "random document" flow.
 * Returns the EasyDo form id, which we persist as `easydo_document_id`.
 */
export async function sendForSignature(args: {
  document_name: string;
  signers: EasydoSigner[];
  pdf: Buffer;
  file_name?: string;
}): Promise<{ document_id: string }> {
  // 1. Create form
  const created = (await easydoFetch("/api/entity/me/forms", {
    name: args.document_name,
    draft: false,
  })) as { id?: string | number; form?: { id?: string | number } };
  const formId = String(created.id ?? created.form?.id ?? "");
  if (!formId) {
    throw new Error(`EasyDo create-form returned no id: ${JSON.stringify(created)}`);
  }

  // 2. Set recipients (temporary/random — by email; SMS requires a registered profile)
  const assignees = args.signers.map((s, i) => ({
    email: s.email,
    name: s.name,
    sequence: i + 1,
    recipient: true,
  }));
  await easydoFetch(`/api/entity/me/forms/${formId}/assignees`, { assignees });

  // 3. Upload PDF (base64)
  await easydoFetch(`/api/entity/me/forms/${formId}/upload`, {
    file: {
      name: args.file_name || "contract.pdf",
      data: args.pdf.toString("base64"),
    },
  });

  return { document_id: formId };
}

/**
 * Verify webhook signature from EasyDo via HMAC-SHA256.
 * Signature is expected in the `x-easydo-signature` header as a hex-encoded
 * HMAC of the raw request body with the shared secret. Falls back to `true`
 * when no secret is configured (dev mode).
 */
export function verifyEasydoWebhook(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) return true;
  if (!signature) return false;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const sigBuf = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  const digBuf = Buffer.from(digest, "hex");
  if (sigBuf.length !== digBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, digBuf);
}
