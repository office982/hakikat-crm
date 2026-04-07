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

/**
 * Save a contract PDF to Google Drive in the tenant's folder.
 * Creates the folder if it doesn't exist.
 */
export async function saveContractToDrive(
  tenantName: string,
  pdfBuffer: Buffer,
  fileName: string
): Promise<string> {
  const accessToken = await getAccessToken();
  const rootFolderId = GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!rootFolderId) {
    throw new Error("Google Drive root folder not configured");
  }

  // Find or create tenant folder
  let tenantFolderId = await findFolder(accessToken, tenantName, rootFolderId);
  if (!tenantFolderId) {
    tenantFolderId = await createFolder(accessToken, tenantName, rootFolderId);
  }

  // Upload file using multipart upload
  const metadata = JSON.stringify({
    name: fileName,
    parents: [tenantFolderId],
  });

  const boundary = "hakikat_boundary";
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/pdf\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${pdfBuffer.toString("base64")}\r\n` +
    `--${boundary}--`;

  const uploadResponse = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  const file = await uploadResponse.json();

  // Make file readable by anyone with link
  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  return file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
}
