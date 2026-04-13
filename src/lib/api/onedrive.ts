// OneDrive Integration — Client-side PKCE OAuth2 (no Client Secret needed)
// Adapted from the existing rental-management project

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = "Files.ReadWrite User.Read offline_access";
const AUTH_BASE = "https://login.microsoftonline.com/consumers/oauth2/v2.0";

function getClientId() {
  return process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID || "";
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────
function randomString(n: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map((b) => chars[b % chars.length])
    .join("");
}

async function pkce() {
  const verifier = randomString(64);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return { verifier, challenge };
}

// ── Token storage ────────────────────────────────────────────────────────────
function saveToken(data: { access_token: string; expires_in: number; refresh_token?: string }) {
  localStorage.setItem("od_token", data.access_token);
  localStorage.setItem("od_expiry", String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) localStorage.setItem("od_refresh", data.refresh_token);
}

async function fetchToken(body: Record<string, string>) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error("Token request failed: " + (await res.text()));
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function signIn(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error("OneDrive Client ID not configured");

  const { verifier, challenge } = await pkce();
  const state = randomString(32);
  const redirectUri = `${window.location.origin}/auth`;

  sessionStorage.setItem("od_verifier", verifier);
  sessionStorage.setItem("od_state", state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  const popup = window.open(
    `${AUTH_BASE}/authorize?${params}`,
    "ms_oauth",
    "width=520,height=680,scrollbars=yes"
  );

  return new Promise((resolve, reject) => {
    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "oauth_code") return;
      window.removeEventListener("message", handler);
      clearInterval(poll);

      if (event.data.state !== state) return reject(new Error("State mismatch"));
      try {
        const data = await fetchToken({
          client_id: clientId,
          grant_type: "authorization_code",
          code: event.data.code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        });
        saveToken(data);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    window.addEventListener("message", handler);

    const poll = setInterval(() => {
      if (popup?.closed) {
        clearInterval(poll);
        window.removeEventListener("message", handler);
        reject(new Error("התחברות בוטלה"));
      }
    }, 500);
  });
}

export function signOut(): void {
  localStorage.removeItem("od_token");
  localStorage.removeItem("od_expiry");
  localStorage.removeItem("od_refresh");
}

export function isSignedIn(): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem("od_token");
}

// ── Token getter (with refresh) ──────────────────────────────────────────────
async function getToken(): Promise<string> {
  const token = localStorage.getItem("od_token");
  const expiry = Number(localStorage.getItem("od_expiry") || "0");

  if (token && Date.now() < expiry - 60_000) return token;

  const refresh = localStorage.getItem("od_refresh");
  if (refresh) {
    const data = await fetchToken({
      client_id: getClientId(),
      grant_type: "refresh_token",
      refresh_token: refresh,
      scope: SCOPES,
    });
    saveToken(data);
    return data.access_token;
  }

  throw new Error("לא מחובר ל-OneDrive — אנא התחבר שוב");
}

// ── Graph helpers ────────────────────────────────────────────────────────────
async function graphGet(path: string) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  if (!res.ok) throw new Error(`Graph API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function graphPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Graph API error ${res.status}`);
  return res.json();
}

async function graphPut(path: string, body: Blob | string, ct = "application/json") {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": ct,
    },
    body,
  });
  if (!res.ok) throw new Error(`Graph API error ${res.status}`);
  return res.json();
}

// ── OneDrive operations ──────────────────────────────────────────────────────

export async function listFolders(
  parentId?: string
): Promise<{ id: string; name: string }[]> {
  const path = parentId
    ? `/me/drive/items/${parentId}/children?$top=200`
    : "/me/drive/root/children?$top=200";
  const data = await graphGet(path);
  return (data.value ?? [])
    .filter((f: { folder?: unknown }) => f.folder != null)
    .map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }));
}

export async function createTenantFolder(
  tenantName: string
): Promise<{ id: string; name: string }> {
  let parentId: string;
  try {
    parentId = (await graphGet("/me/drive/root:/דיירים:?$select=id")).id;
  } catch {
    parentId = (
      await graphPost("/me/drive/root/children", {
        name: "דיירים",
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      })
    ).id;
  }
  const folder = await graphPost(`/me/drive/items/${parentId}/children`, {
    name: tenantName,
    folder: {},
    "@microsoft.graph.conflictBehavior": "rename",
  });
  return { id: folder.id, name: folder.name };
}

export async function uploadToFolder(
  folderId: string,
  fileName: string,
  content: Blob
): Promise<string> {
  const data = await graphPut(
    `/me/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
    content,
    content.type || "application/octet-stream"
  );
  return data.webUrl as string;
}

export async function listFolderFiles(
  folderId: string
): Promise<{ id: string; name: string; webUrl: string; lastModified: string; size: number }[]> {
  const data = await graphGet(
    `/me/drive/items/${folderId}/children?$select=id,name,webUrl,lastModifiedDateTime,size&$orderby=lastModifiedDateTime desc&$top=100`
  );
  return (data.value ?? []).map(
    (f: { id: string; name: string; webUrl: string; lastModifiedDateTime: string; size?: number }) => ({
      id: f.id,
      name: f.name,
      webUrl: f.webUrl,
      lastModified: f.lastModifiedDateTime,
      size: f.size ?? 0,
    })
  );
}

export async function saveContractToOneDrive(
  tenantName: string,
  contractBlob: Blob,
  fileName: string
): Promise<string> {
  const folder = await createTenantFolder(tenantName);
  return uploadToFolder(folder.id, fileName, contractBlob);
}
