// Server-side OneDrive integration (refresh-token flow).
//
// Used by the OneDrive backup worker job. Distinct from the browser
// PKCE flow in `onedrive.ts` which signs the operator into their own
// drive from the wizard — this module uses a long-lived refresh token
// stored in env so backups run unattended.
//
// Required env:
//   ONEDRIVE_CLIENT_ID       — Microsoft app (public or confidential) client id
//   ONEDRIVE_REFRESH_TOKEN   — refresh token issued with `offline_access`
// Optional env:
//   ONEDRIVE_CLIENT_SECRET   — only for confidential clients
//   ONEDRIVE_TENANT_ID       — `consumers` (default), `common`, or a tenant guid

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "Files.ReadWrite offline_access";

let cached: { token: string; expiresAt: number } | null = null;

function tokenUrl(): string {
  const tenant = process.env.ONEDRIVE_TENANT_ID || "consumers";
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

export function isOneDriveServerConfigured(): boolean {
  return !!(process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_REFRESH_TOKEN);
}

async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const refresh = process.env.ONEDRIVE_REFRESH_TOKEN;
  if (!clientId || !refresh) {
    throw new Error("OneDrive server not configured (ONEDRIVE_CLIENT_ID + ONEDRIVE_REFRESH_TOKEN required)");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refresh,
    scope: SCOPES,
  });
  if (process.env.ONEDRIVE_CLIENT_SECRET) {
    body.set("client_secret", process.env.ONEDRIVE_CLIENT_SECRET);
  }

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`OneDrive token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function graph(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Graph ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res;
}

interface DriveItem {
  id: string;
  name: string;
  folder?: unknown;
}

/**
 * Find or create a folder by name under `parentId` (or under root if null).
 * Returns the folder's drive item id.
 */
export async function ensureOneDriveFolder(
  name: string,
  parentId?: string | null
): Promise<string> {
  const childrenPath = parentId
    ? `/me/drive/items/${parentId}/children`
    : `/me/drive/root/children`;

  const listRes = await graph(`${childrenPath}?$select=id,name,folder&$top=200`);
  const list = (await listRes.json()) as { value: DriveItem[] };
  const found = list.value.find((f) => f.folder && f.name === name);
  if (found) return found.id;

  const createRes = await graph(childrenPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

/**
 * Upload via resumable upload session. Handles small (<4 MB) and
 * large files identically. Chunks at 5 MB which is well under the
 * 60 MiB Graph limit and is a multiple of 320 KiB as required.
 */
export async function uploadToOneDrive(args: {
  folderId: string;
  fileName: string;
  data: Buffer;
  mimeType?: string;
}): Promise<{ id: string; web_url: string; size_bytes: number }> {
  const sessionRes = await graph(
    `/me/drive/items/${args.folderId}:/${encodeURIComponent(args.fileName)}:/createUploadSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: { "@microsoft.graph.conflictBehavior": "rename" },
      }),
    }
  );
  const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string };

  const total = args.data.length;
  const CHUNK = 5 * 1024 * 1024;
  let result: { id: string; webUrl: string; size?: number } | null = null;

  for (let start = 0; start < total; start += CHUNK) {
    const end = Math.min(start + CHUNK, total) - 1;
    const chunk = args.data.subarray(start, end + 1);
    // Wrap as a Blob — Buffer/Uint8Array<ArrayBufferLike> isn't accepted
    // as BodyInit under lib.dom's stricter typings, so copy into a plain
    // Uint8Array first (matches the pattern used in lib/api/telegram.ts).
    const body = new Blob([new Uint8Array(chunk)], {
      type: args.mimeType || "application/octet-stream",
    });
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end}/${total}`,
      },
      body,
    });

    if (res.status === 200 || res.status === 201) {
      result = (await res.json()) as { id: string; webUrl: string; size?: number };
      break;
    }
    if (res.status !== 202) {
      throw new Error(`OneDrive chunk upload failed ${res.status}: ${await res.text()}`);
    }
  }

  if (!result) {
    // Server returned 202 for the final chunk without a finished item —
    // shouldn't happen, but fail loudly rather than silently.
    throw new Error("OneDrive upload finished without a final 200/201 response");
  }
  return { id: result.id, web_url: result.webUrl, size_bytes: result.size ?? total };
}
