import { NextRequest, NextResponse } from "next/server";
import { createAccountbookDocument } from "@/lib/api/accountbook";

export async function POST(request: NextRequest) {
  try {
    const { client_name, client_id, amount, description, email } = await request.json();

    if (!client_name || !amount) {
      return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
    }

    const result = await createAccountbookDocument({
      client_name,
      client_id: client_id || undefined,
      client_email: email || undefined,
      amount,
      description: description || "שכר דירה",
      type: "invoice_receipt",
    });

    return NextResponse.json({
      docnum: result.number,
      doc_url: result.url,
      doc_id: result.id,
    });
  } catch (error) {
    console.error("Accountbook invoice error:", error);
    return NextResponse.json({ error: "שגיאה בהנפקת חשבונית" }, { status: 500 });
  }
}
