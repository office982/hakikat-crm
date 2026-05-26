// EasyDo digital signature integration.
//
// Four-step "random document" flow per EasyDo's API:
//   1. POST /api/entity/me/forms                            -> form id (draft)
//   2. POST /api/entity/me/forms/{id}/assignees             -> recipients
//   3. POST /api/entity/me/forms/{id}/upload                -> base64 PDF
//   4. PUT  /api/entity/me/forms/{id}                       -> dispatch (status: waiting)
//
// Steps 1-3 stage the form. Without step 4 the form sits at
// status="incomplete" and never shows up in the EasyDo dashboard,
// even though the assignee already has a fill_url.
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
      // EasyDo expects credentials as request headers, not in the body.
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "client-id": clientId,
        "client-secret": clientSecret,
      },
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

// For PDF uploads we don't want to dump a multi-MB base64 string into logs.
// `redactedBody` lets the caller pass a sanitized version of the request body
// (e.g. base64 replaced with "<N bytes>") just for the log line.
async function easydoFetch(
  path: string,
  body: unknown,
  opts?: { redactedBody?: unknown; method?: "POST" | "PUT" }
): Promise<unknown> {
  const token = await getToken();
  const url = `${API_BASE}${path}`;
  const method = opts?.method ?? "POST";
  console.log("[easydo] -> request", {
    method,
    url,
    body: opts?.redactedBody ?? body,
  });
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const rawBody = await res.text();
  if (!res.ok) {
    console.error("[easydo] api call failed", { url, status: res.status, body: rawBody });
    // If the cached token was revoked mid-flight, drop it so the next call
    // re-authenticates instead of looping on a dead token.
    if (res.status === 401 || res.status === 403) tokenCache = null;
    throw new Error(`EasyDo ${path} -> ${res.status}: ${rawBody}`);
  }
  console.log("[easydo] <- response", { url, status: res.status, body: rawBody });
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
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

  // 1. Create form (as draft — step 4 dispatches it).
  const created = (await easydoFetch("/api/entity/me/forms", {
    name: args.document_name,
    draft: true,
  })) as { id?: string | number; form?: { id?: string | number } };
  const formId = String(created.id ?? created.form?.id ?? "");
  if (!formId) {
    throw new Error(`EasyDo create-form returned no id: ${JSON.stringify(created)}`);
  }
  console.log("[easydo] step 1/4 form created", { formId });

  // 2. Set recipients (temporary/random — by email).
  // `notify_platform: "email"` is required for EasyDo to actually dispatch the
  // signature link; without it the form is staged but no email is sent.
  const assignees = args.signers.map((s, i) => ({
    email: s.email,
    name: s.name,
    sequence: i + 1,
    notify_platform: "email",
    recipient: true,
  }));
  await easydoFetch(`/api/entity/me/forms/${formId}/assignees`, { assignees });
  console.log("[easydo] step 2/4 assignees set", { formId, count: assignees.length });

  // 3. Upload PDF (base64). `mime: "application/pdf"` tells EasyDo to treat
  // it as a PDF form (vs. a generic attachment) so the PDF interpreter runs.
  const uploadBody = {
    file: {
      name: args.file_name || "contract.pdf",
      data: args.pdf.toString("base64"),
      mime: "application/pdf",
    },
  };
  await easydoFetch(`/api/entity/me/forms/${formId}/upload`, uploadBody, {
    redactedBody: {
      file: {
        name: uploadBody.file.name,
        data: `<${args.pdf.length} bytes base64>`,
        mime: uploadBody.file.mime,
      },
    },
  });
  console.log("[easydo] step 3/4 pdf uploaded", { formId });

  // 4. Dispatch the form. Without this PUT the form sits at
  // status="incomplete" and never appears in the EasyDo dashboard.
  // `draft: false` is the actual dispatch trigger — it flips the form
  // out of the draft-forms list and into the sender's main view.
  await easydoFetch(
    `/api/entity/me/forms/${formId}`,
    { draft: false },
    { method: "PUT" }
  );
  console.log("[easydo] step 4/4 form dispatched", { formId });

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
