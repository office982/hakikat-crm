import { NextResponse } from "next/server";
import { listAccountbookClients } from "@/lib/api/accountbook";

/**
 * Proxy to Accountbook's GetClientsListMin. Used by the tenant-link UI to
 * populate a dropdown of existing Accountbook clients.
 */
export async function GET() {
  try {
    const clients = await listAccountbookClients();
    return NextResponse.json({ clients });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
