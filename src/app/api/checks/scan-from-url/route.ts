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

interface Body {
  image_urls: string[];
}

export interface ScannedCheck {
  check_number: string | null;
  bank_name: string | null;
  branch_number: string | null;
  account_number: string | null;
  amount: number | null;
  due_date: string | null;
}

/**
 * Scan checks from remote image URLs (e.g. WATI media URLs).
 * Downloads each URL, encodes as base64, sends to Claude Vision.
 */
export async function POST(request: NextRequest) {
  try {
    const { image_urls }: Body = await request.json();
    if (!image_urls || image_urls.length === 0) {
      return NextResponse.json({ error: "נדרש לפחות URL אחד" }, { status: 400 });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY לא מוגדר" }, { status: 500 });
    }

    // Download every image and convert to base64 + media type
    const content: Array<
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      | { type: "text"; text: string }
    > = [];

    for (const url of image_urls) {
      const headers: Record<string, string> = {};
      // WATI media URLs require auth
      if (url.includes(process.env.WATI_BASE_URL || "wati.io") && process.env.WATI_API_KEY) {
        headers["Authorization"] = `Bearer ${process.env.WATI_API_KEY}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`failed to fetch image (${res.status}): ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const mediaType = res.headers.get("content-type") || "image/jpeg";
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType.split(";")[0],
          data: buf.toString("base64"),
        },
      });
    }

    content.push({
      type: "text",
      text: `סרוק את הצ'קים בתמונות והחזר JSON array. מספר התמונות: ${image_urls.length}`,
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
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} — ${err}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "לא הצלחתי לזהות צ'קים בתמונות", raw: text },
        { status: 422 }
      );
    }
    const checks: ScannedCheck[] = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ checks });
  } catch (err) {
    console.error("scan-from-url failed:", err);
    return NextResponse.json(
      { error: "שגיאה בסריקת הצ'קים", details: String(err) },
      { status: 500 }
    );
  }
}
