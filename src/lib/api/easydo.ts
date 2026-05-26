// EasyDo digital signature integration.
//
// Four-step "random document" flow per EasyDo's API:
//   1. POST /api/entity/{ENTITY_ID}/forms                   -> form id (draft)
//   2. POST /api/entity/{ENTITY_ID}/forms/{id}/assignees    -> recipients
//   3. POST /api/entity/{ENTITY_ID}/forms/{id}/upload       -> base64 PDF
//   4. PUT  /api/entity/{ENTITY_ID}/forms/{id}              -> dispatch + place
//                                                              signature field
// ENTITY_ID is the company/account scope. For "שיא הכרמל (חקיקת נכסים)" this
// is 3529 — visible as `entity_id` in every form response.
//
// Steps 1-3 stage the form. Without step 4 the form sits at
// status="incomplete" and never shows up in the EasyDo dashboard,
// even though the assignee already has a fill_url.
//
// `draft` is only accepted by the PUT update endpoint, not POST create —
// the form starts as draft by default and step 4 flips it via `draft: false`.
//
// Auth is OAuth client-credentials: exchange CLIENT_ID + CLIENT_SECRET
// for a short-lived Bearer token via /api/auth/token. The token is
// cached in-process until ~1 minute before expiry.
//
// Webhook is configured globally in the EasyDo dashboard (API Client
// settings) — not per-request.

const AUTH_BASE = "https://api.easydo.co.il";
const API_BASE = "https://api.easydoc.co.il";
const ENTITY_ID = "3529";

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

// Form response shape from POST /forms, PUT /forms/{id}, GET /forms/{id}.
// Per EasyDo API docs — only fields we actually read are required here.
export interface EasydoFormResponse {
  id: number;
  entity_id: number | string;
  name: string | null;
  status: string;
  admin_status?: string | null;
  dir_hash?: string | null;
  payload_id?: string | null;
  payload?: { data?: Record<string, unknown> | unknown[] } | null;
  assignees?: Array<{
    id: number;
    slug: string;
    form_id: number;
    sequence: number;
    profile_id: number | null;
    placeholder: string | null;
    template_role_id: number | null;
    public: boolean;
    status: string;
    notify_platform: string | null;
    notify_notes: string | null;
  }>;
  files?: unknown[];
  created_at: string;
  updated_at: string;
}

/**
 * Send a PDF for digital signature via EasyDo's four-step "random document"
 * flow. Returns the EasyDo form id, which we persist as `easydo_document_id`.
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

  // 1. Create form. Per docs the body is { name, meta_data? }; the form
  // starts as draft by default and step 4 dispatches it via `draft: false`.
  const created = (await easydoFetch(`/api/entity/${ENTITY_ID}/forms`, {
    name: args.document_name,
  })) as Partial<EasydoFormResponse>;
  const formId = created.id ? String(created.id) : "";
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
  await easydoFetch(`/api/entity/${ENTITY_ID}/forms/${formId}/assignees`, { assignees });
  console.log("[easydo] step 2/4 assignees set", { formId, count: assignees.length });

  // 3. Upload PDF (base64). `mime: "application/pdf"` tells EasyDo to treat
  // it as a PDF form (vs. a generic attachment) so the PDF interpreter runs.
  // The response's payload.data keys are the bg image URLs we need in step 4.
  const uploadBody = {
    file: {
      name: args.file_name || "contract.pdf",
      data: args.pdf.toString("base64"),
      mime: "application/pdf",
    },
  };
  const uploaded = (await easydoFetch(
    `/api/entity/${ENTITY_ID}/forms/${formId}/upload`,
    uploadBody,
    {
      redactedBody: {
        file: {
          name: uploadBody.file.name,
          data: `<${args.pdf.length} bytes base64>`,
          mime: uploadBody.file.mime,
        },
      },
    }
  )) as { payload?: { data?: Record<string, unknown> } };
  console.log("[easydo] step 3/4 pdf uploaded", { formId });

  // Extract the bg image URLs EasyDo generated from the PDF (one per page),
  // sorted by page number. The PUT in step 4 must echo these exact keys.
  const bgUrls = Object.keys(uploaded.payload?.data ?? {}).sort((a, b) => {
    const pageNum = (u: string) =>
      parseInt(u.match(/\/bg\/(\d+)\.[a-z]+$/i)?.[1] ?? "0", 10);
    return pageNum(a) - pageNum(b);
  });
  if (bgUrls.length === 0) {
    throw new Error(`EasyDo upload returned no page bg images for form ${formId}`);
  }

  // 4. Place a signature field on the last page and dispatch the form.
  // Without at least one signable field, EasyDo keeps the form at
  // status="incomplete" and hides it from the sender's dashboard.
  // Coordinates are 0–1 relative to the page; field goes bottom-center.
  const signatureField = {
    pos_x: 0.35,
    pos_y: 0.85,
    width: 0.3,
    height: 0.08,
    name: null,
    placeholder: null,
    font: "Arial",
    font_size: "16",
    type: "input-signature",
    role_id: "1",
  };
  const fieldsByPage: Record<string, object[]> = {};
  for (const url of bgUrls) fieldsByPage[url] = [];
  fieldsByPage[bgUrls[bgUrls.length - 1]] = [signatureField];

  // Per EasyDo's Update form schema, `data` is typed as a JSON-encoded string
  // (not a raw object). Sending a raw object causes the field to be silently
  // dropped — the form stays at status="incomplete". JSON.stringify it.
  await easydoFetch(
    `/api/entity/${ENTITY_ID}/forms/${formId}`,
    { draft: false, data: JSON.stringify(fieldsByPage) },
    { method: "PUT" }
  );
  console.log("[easydo] step 4/4 form dispatched", {
    formId,
    pages: bgUrls.length,
    sig_on_page: bgUrls.length,
  });

  return { document_id: formId };
}

/**
 * Fetch the current state of a form by id (GET /api/entity/{ENTITY_ID}/forms/{form_id}).
 * Useful for polling status when a webhook isn't available.
 */
export async function getForm(formId: string | number): Promise<EasydoFormResponse> {
  const token = await getToken();
  const url = `${API_BASE}/api/entity/${ENTITY_ID}/forms/${formId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const rawBody = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) tokenCache = null;
    throw new Error(`EasyDo GET form ${formId} -> ${res.status}: ${rawBody}`);
  }
  return JSON.parse(rawBody) as EasydoFormResponse;
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
