const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
}

/**
 * Get fresh access token using refresh token.
 */
async function getAccessToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google Drive credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const data: GoogleTokenResponse = await response.json();
  return data.access_token;
}

/**
 * Search for a folder by name in a parent folder.
 */
async function findFolder(accessToken: string, name: string, parentId: string): Promise<string | null> {
  const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await response.json();
  return data.files?.[0]?.id || null;
}

/**
 * Create a folder in Google Drive.
 */
async function createFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });

  const data = await response.json();
  return data.id;
}

export interface DriveUploadResult {
  id: string;
  web_view_link: string;
  size_bytes?: number;
}

/**
 * Low-level: upload an arbitrary buffer to a Drive folder.
 * Returns the file id + link. Does NOT set permissions (caller decides).
 */
export async function uploadToDriveFolder(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}): Promise<DriveUploadResult> {
  const accessToken = await getAccessToken();
  const metadata = JSON.stringify({
    name: params.fileName,
    parents: [params.folderId],
  });

  const boundary = "hakikat_boundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${params.mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${params.data.toString("base64")}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,size",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${res.status} — ${err}`);
  }
  const file = await res.json();
  return {
    id: file.id,
    web_view_link: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    size_bytes: file.size ? Number(file.size) : params.data.length,
  };
}

/**
 * Ensure a folder exists under `parentId`, creating it if missing.
 * Returns the folder id.
 */
export async function ensureFolder(folderName: string, parentId: string): Promise<string> {
  const accessToken = await getAccessToken();
  const existing = await findFolder(accessToken, folderName, parentId);
  if (existing) return existing;
  return createFolder(accessToken, folderName, parentId);
}

/**
 * Share a file with anyone who has the link.
 */
export async function makeFilePublic(fileId: string): Promise<void> {
  const accessToken = await getAccessToken();
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

/**
 * Save a contract PDF to Google Drive in the tenant's folder.
 * Creates the folder if it doesn't exist.
 */
export async function saveContractToDrive(
  tenantName: string,
  pdfBuffer: Buffer,
  fileName: string
): Promise<string> {
  const rootFolderId = GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    throw new Error("Google Drive root folder not configured");
  }
  const tenantFolderId = await ensureFolder(tenantName, rootFolderId);

  const file = await uploadToDriveFolder({
    folderId: tenantFolderId,
    fileName,
    mimeType: "application/pdf",
    data: pdfBuffer,
  });

  await makeFilePublic(file.id);
  return file.web_view_link;
}

/**
 * Detect mime type from a URL extension. Conservative — defaults
 * to application/octet-stream and lets caller decide if that's OK.
 */
function mimeFromUrl(url: string): string {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/**
 * Save a check image (or any tenant artifact) to Drive under
 * tenant-folder / "Checks". Best-effort — caller catches errors.
 * Returns the Drive web view link.
 */
export async function saveCheckImageToDrive(params: {
  tenantName: string;
  imageUrl: string;
  fileName: string;
}): Promise<string> {
  const rootFolderId = GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error("Google Drive root folder not configured");

  const res = await fetch(params.imageUrl);
  if (!res.ok) throw new Error(`fetch image ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const tenantFolderId = await ensureFolder(params.tenantName, rootFolderId);
  const checksFolderId = await ensureFolder("Checks", tenantFolderId);

  const file = await uploadToDriveFolder({
    folderId: checksFolderId,
    fileName: params.fileName,
    mimeType: mimeFromUrl(params.imageUrl),
    data: buf,
  });
  await makeFilePublic(file.id);
  return file.web_view_link;
}

/**
 * Save a receipt PDF (downloaded from Accountbook) to Drive
 * under tenant-folder / "Receipts".
 */
export async function saveReceiptToDrive(params: {
  tenantName: string;
  pdfUrl: string;
  fileName: string;
}): Promise<string> {
  const rootFolderId = GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) throw new Error("Google Drive root folder not configured");

  const res = await fetch(params.pdfUrl);
  if (!res.ok) throw new Error(`fetch receipt ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const tenantFolderId = await ensureFolder(params.tenantName, rootFolderId);
  const receiptsFolderId = await ensureFolder("Receipts", tenantFolderId);

  const file = await uploadToDriveFolder({
    folderId: receiptsFolderId,
    fileName: params.fileName,
    mimeType: "application/pdf",
    data: buf,
  });
  await makeFilePublic(file.id);
  return file.web_view_link;
}

/**
 * Read a single feature flag from settings. Returns true unless
 * explicitly "false" — failure-safe default.
 */
export async function isDriveBackupEnabled(key: string): Promise<boolean> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.from("settings").select("value").eq("key", key).single();
  return data?.value !== "false";
}
