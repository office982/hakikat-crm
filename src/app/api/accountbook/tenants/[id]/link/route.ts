import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

interface LinkBody {
  /** Pass null to unlink, or a numeric Accountbook ClientNumber to link. */
  client_number: number | null;
}

/**
 * Manually link / unlink a single tenant to an Accountbook client.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing tenant id" }, { status: 400 });

  let body: LinkBody;
  try {
    body = (await request.json()) as LinkBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const value =
    body.client_number === null || body.client_number === undefined
      ? null
      : Number(body.client_number);
  if (value !== null && !Number.isInteger(value)) {
    return NextResponse.json({ error: "client_number must be integer or null" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tenants")
    .update({ accountbook_client_number: value })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tenant_id: id, accountbook_client_number: value });
}
