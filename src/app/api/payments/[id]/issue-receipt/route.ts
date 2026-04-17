import { NextRequest, NextResponse } from "next/server";
import { issueReceiptForPayment } from "@/lib/receipts";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing payment id" }, { status: 400 });
  }

  const result = await issueReceiptForPayment(id);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "failed" },
      { status: 500 }
    );
  }

  if (result.skipped) {
    return NextResponse.json({ skipped: true });
  }

  return NextResponse.json({
    docnum: result.doc_number,
    doc_id: result.doc_id,
    doc_url: result.doc_url,
  });
}
