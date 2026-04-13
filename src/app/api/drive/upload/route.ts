import { NextResponse } from "next/server";

// OneDrive uploads happen client-side via PKCE OAuth.
// This endpoint is kept as a fallback / for future server-side uploads.
export async function POST() {
  return NextResponse.json({
    error: "OneDrive uploads are handled client-side. Use the OneDrive client library.",
    hint: "Import { saveContractToOneDrive } from '@/lib/api/onedrive'",
  }, { status: 400 });
}
