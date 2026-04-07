import { NextRequest, NextResponse } from "next/server";
import { callAIAgent } from "@/lib/api/claude";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "נדרשת הודעה בשדה message" },
        { status: 400 }
      );
    }

    const result = await callAIAgent(message);

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Agent error:", error);
    return NextResponse.json(
      { error: "שגיאה בעיבוד הבקשה", details: String(error) },
      { status: 500 }
    );
  }
}
