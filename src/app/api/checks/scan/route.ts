import { NextRequest, NextResponse } from "next/server";

function getApiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

const CHECK_SCAN_SYSTEM_PROMPT = `אתה סורק צ'קים ישראליים. לכל תמונה של צ'ק, זהה את הפרטים הבאים:
- check_number: מספר הצ'ק
- bank_name: שם הבנק
- branch_number: מספר סניף
- account_number: מספר חשבון
- amount: סכום (מספר בלבד, בלי סימן מטבע)
- due_date: תאריך פירעון בפורמט YYYY-MM-DD

החזר JSON array. אם לא ניתן לזהות שדה, החזר null עבורו.
דוגמה: [{"check_number": "1234", "bank_name": "לאומי", "branch_number": "123", "account_number": "456789", "amount": 1500, "due_date": "2026-05-01"}]`;

export interface ScannedCheck {
  check_number: string | null;
  bank_name: string | null;
  branch_number: string | null;
  account_number: string | null;
  amount: number | null;
  due_date: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const { images } = await request.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: "נדרשת לפחות תמונה אחת" },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY לא מוגדר" },
        { status: 500 }
      );
    }

    // Build content array with all images
    const content: Array<
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      | { type: "text"; text: string }
    > = [];

    for (const image of images) {
      // Extract media type from base64 data URI if present
      let mediaType = "image/jpeg";
      let base64Data = image;

      if (image.startsWith("data:")) {
        const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          mediaType = match[1];
          base64Data = match[2];
        }
      }

      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64Data,
        },
      });
    }

    content.push({
      type: "text",
      text: `סרוק את הצ'קים בתמונות והחזר JSON array עם הפרטים. מספר התמונות: ${images.length}`,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: CHECK_SCAN_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} — ${err}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "לא הצלחתי לזהות צ'קים בתמונות", raw: text },
        { status: 422 }
      );
    }

    const checks: ScannedCheck[] = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ checks });
  } catch (error) {
    console.error("Check scan error:", error);
    return NextResponse.json(
      { error: "שגיאה בסריקת הצ'קים", details: String(error) },
      { status: 500 }
    );
  }
}
