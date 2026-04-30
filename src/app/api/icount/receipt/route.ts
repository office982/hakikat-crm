import { NextRequest, NextResponse } from "next/server";
import { createAccountbookDocument } from "@/lib/api/accountbook";

export async function POST(request: NextRequest) {
  try {
    const { client_name, client_id, amount, description, email, legal_entity_name, client_number } =
      await request.json();

    if (!client_name || !amount) {
      return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
    }

    // חקיקת פרטי לא מפיקה מסמכים חשבונאיים
    if (legal_entity_name === "חקיקת פרטי") {
      return NextResponse.json({
        error: "ישות 'חקיקת פרטי' אינה מפיקה מסמכים חשבונאיים",
        skipped: true,
      }, { status: 400 });
    }

    const result = await createAccountbookDocument({
      client_name,
      client_id: client_id || undefined,
      client_email: email || undefined,
      client_number: client_number ?? undefined,
      amount,
      description: description || "שכר דירה",
      type: "receipt",
    });

    return NextResponse.json({
      docnum: result.number,
      doc_url: result.url,
      doc_id: result.id,
    });
  } catch (error) {
    console.error("Accountbook receipt error:", error);
    return NextResponse.json({ error: "שגיאה בהנפקת קבלה" }, { status: 500 });
  }
}
