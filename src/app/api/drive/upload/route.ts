import { NextRequest, NextResponse } from "next/server";
import { saveContractToDrive } from "@/lib/api/google-drive";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const tenantName = formData.get("tenant_name") as string | null;
    const fileName = formData.get("file_name") as string | null;

    if (!file || !tenantName) {
      return NextResponse.json({ error: "נדרש קובץ ושם דייר" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = fileName || `חוזה_${tenantName}_${new Date().toISOString().split("T")[0]}.pdf`;

    const driveUrl = await saveContractToDrive(tenantName, buffer, name);

    return NextResponse.json({ url: driveUrl });
  } catch (error) {
    console.error("Google Drive upload error:", error);
    return NextResponse.json({ error: "שגיאה בהעלאה ל-Google Drive" }, { status: 500 });
  }
}
