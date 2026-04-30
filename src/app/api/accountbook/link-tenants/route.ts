import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import {
  listAccountbookClients,
  matchTenantsToClients,
} from "@/lib/api/accountbook";

interface LinkTenantsBody {
  /** When true, also re-match tenants that already have a client number set. */
  relink_all?: boolean;
  /** When true, do the matching but don't write — return the planned matches. */
  dry_run?: boolean;
}

/**
 * Bulk-match tenants against Accountbook's client list and persist the
 * mapping on `tenants.accountbook_client_number`.
 *
 * Match priority: id_number (OsekNum) → email → phone → full name.
 * Ambiguous matches are skipped — link them manually via
 * /api/accountbook/tenants/[id]/link.
 */
export async function POST(request: NextRequest) {
  let body: LinkTenantsBody = {};
  try {
    body = (await request.json()) as LinkTenantsBody;
  } catch {
    // empty body is fine
  }

  try {
    const clients = await listAccountbookClients();

    let query = supabase
      .from("tenants")
      .select("id, full_name, id_number, phone, email, accountbook_client_number")
      .eq("is_active", true);
    if (!body.relink_all) {
      query = query.is("accountbook_client_number", null);
    }
    const { data: tenants, error } = await query;
    if (error) throw error;
    if (!tenants) return NextResponse.json({ matched: 0, matches: [] });

    const matches = matchTenantsToClients(tenants, clients);

    if (body.dry_run) {
      return NextResponse.json({
        matched: matches.length,
        scanned: tenants.length,
        clients_total: clients.length,
        matches,
        dry_run: true,
      });
    }

    let written = 0;
    for (const m of matches) {
      const { error: upErr } = await supabase
        .from("tenants")
        .update({ accountbook_client_number: m.client_id })
        .eq("id", m.tenant_id);
      if (!upErr) written++;
    }

    return NextResponse.json({
      matched: matches.length,
      written,
      scanned: tenants.length,
      clients_total: clients.length,
      matches,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
