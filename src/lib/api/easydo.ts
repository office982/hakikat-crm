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

// Mask a secret for logs — show length + first/last 2 chars, never the value.
function mask(s: string | undefined): string {
  if (!s) return "<missing>";
  if (s.length <= 6) return `<len=${s.length}>`;
  return `${s.slice(0, 2)}…${s.slice(-2)} (len=${s.length})`;
}

function readCreds(): { clientId: string; clientSecret: string } | null {
  // Trim — pasted secrets often carry a trailing newline or surrounding quotes
  // that silently break auth. Strip both.
  const strip = (v: string | undefined) =>
    (v ?? "").trim().replace(/^["']|["']$/g, "");
  const clientId = strip(process.env.EASYDO_CLIENT_ID);
  const clientSecret = strip(process.env.EASYDO_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isEasydoConfigured(): boolean {
  return readCreds() !== null;
}

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const creds = readCreds();
  if (!creds) {
    throw new Error("EasyDo not configured (EASYDO_CLIENT_ID + EASYDO_CLIENT_SECRET required)");
  }
  const { clientId, clientSecret } = creds;

  const authUrl = `${AUTH_BASE}/api/auth/token`;
  console.log("[easydo] requesting token", {
    url: authUrl,
    client_id: mask(clientId),
    client_secret: mask(clientSecret),
  });

  let res: Response;
  try {
    res = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // EasyDo's auth body uses hyphenated keys, not snake/camelCase.
      body: JSON.stringify({ "client-id": clientId, "client-secret": clientSecret }),
    });
  } catch (e) {
    console.error("[easydo] token request network error", e);
    throw new Error(`EasyDo auth network error: ${String(e)}`);
  }

  const rawBody = await res.text();
  if (!res.ok) {
    console.error("[easydo] token request failed", {
      url: authUrl,
      status: res.status,
      statusText: res.statusText,
      body: rawBody,
      client_id: mask(clientId),
    });
    // Surface a hint on the most common cause of 403/not_authorized: the API
    // client exists but its scopes/permissions weren't enabled in the EasyDo
    // dashboard, or the credentials are stale/rotated.
    const hint =
      res.status === 401 || res.status === 403
        ? " (check EASYDO_CLIENT_ID/SECRET are current and the API client has the required permissions in the EasyDo dashboard)"
        : "";
    throw new Error(`EasyDo auth failed: ${res.status} — ${rawBody}${hint}`);
  }

  let data: TokenResponse;
  try {
    data = JSON.parse(rawBody) as TokenResponse;
  } catch {
    throw new Error(`EasyDo auth returned non-JSON: ${rawBody.slice(0, 200)}`);
  }
  if (!data.access_token) {
    throw new Error(`EasyDo auth response missing access_token: ${rawBody.slice(0, 200)}`);
  }

  // expires_in is in seconds; default to 1h if absent.
  const ttlMs = (data.expires_in ?? 3600) * 1000;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ttlMs };
  console.log("[easydo] token acquired", { expires_in_s: data.expires_in ?? 3600 });
  return data.access_token;
}

async function easydoFetch(path: string, body: unknown): Promise<unknown> {
  const token = await getToken();
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error("[easydo] api call failed", { url, status: res.status, body: errBody });
    // If the cached token was revoked mid-flight, drop it so the next call
    // re-authenticates instead of looping on a dead token.
    if (res.status === 401 || res.status === 403) tokenCache = null;
    throw new Error(`EasyDo ${path} -> ${res.status}: ${errBody}`);
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
  console.log("[easydo] sendForSignature start", {
    document_name: args.document_name,
    signers: args.signers.length,
    pdf_bytes: args.pdf.length,
  });

  // 1. Create form
  const created = (await easydoFetch("/api/entity/me/forms", {
    name: args.document_name,
    draft: false,
  })) as { id?: string | number; form?: { id?: string | number } };
  const formId = String(created.id ?? created.form?.id ?? "");
  if (!formId) {
    throw new Error(`EasyDo create-form returned no id: ${JSON.stringify(created)}`);
  }
  console.log("[easydo] step 1/3 form created", { formId });

  // 2. Set recipients (temporary/random — by email; SMS requires a registered profile)
  const assignees = args.signers.map((s, i) => ({
    email: s.email,
    name: s.name,
    sequence: i + 1,
    recipient: true,
  }));
  await easydoFetch(`/api/entity/me/forms/${formId}/assignees`, { assignees });
  console.log("[easydo] step 2/3 assignees set", { formId, count: assignees.length });

  // 3. Upload PDF (base64)
  await easydoFetch(`/api/entity/me/forms/${formId}/upload`, {
    file: {
      name: args.file_name || "contract.pdf",
      data: args.pdf.toString("base64"),
    },
  });
  console.log("[easydo] step 3/3 pdf uploaded", { formId });

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
