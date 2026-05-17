function getApiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

/**
 * Classifies an inbound WhatsApp image and, when it's a supplier
 * invoice/bill (חשבונית), extracts the structured fields we need to
 * record it as a project expense.
 *
 * Checks (צ'קים) are deliberately NOT parsed here — they keep their own
 * dedicated multi-check pipeline (handleWhatsAppCheckImage). We only need
 * to recognise them so the webhook routes them there.
 */
export type DocumentType = "check" | "invoice" | "other";

export interface ScannedInvoice {
  supplier_name: string | null;
  amount: number | null;
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  due_date: string | null; // YYYY-MM-DD
  description: string | null;
}

export interface ScannedDocument {
  doc_type: DocumentType;
  invoice: ScannedInvoice | null;
}

const DOC_SCAN_SYSTEM_PROMPT = `אתה מסווג מסמכים שמתקבלים בוואטסאפ של חברת ניהול נדל"ן, ומחלץ מהם נתונים.

סווג את התמונה לאחד מהסוגים:
- "check" — צ'ק בנקאי ישראלי (שובר תשלום עם מספר צ'ק, סניף, חשבון, בנק).
- "invoice" — חשבונית / קבלה / חשבון ספק (חשמל, מים, ארנונה, קבלן, ספק שירות וכו').
- "other" — כל דבר אחר (צילום מסך, תמונה לא רלוונטית, מסמך לא מזוהה).

אם ורק אם doc_type = "invoice", חלץ גם את השדות הבאים מהחשבונית:
- supplier_name: שם הספק / הגוף המנפיק (למשל "חברת החשמל לישראל", "תאגיד המים").
- amount: הסכום הכולל לתשלום — מספר בלבד, בלי ₪ ובלי פסיקים.
- invoice_number: מספר החשבונית / מספר חשבון לתשלום.
- invoice_date: תאריך הפקת החשבונית בפורמט YYYY-MM-DD.
- due_date: התאריך האחרון לתשלום בפורמט YYYY-MM-DD.
- description: תיאור קצר בעברית של מהות החיוב (למשל "חשבון חשמל", "ארנונה").

לכל שדה שלא ניתן לזהות בוודאות — החזר null. אל תנחש.
עבור "check" ו-"other" החזר invoice: null.

החזר JSON בלבד, ללא טקסט נוסף:
{"doc_type":"invoice","invoice":{"supplier_name":"...","amount":197.55,"invoice_number":"...","invoice_date":"2026-02-23","due_date":"2026-05-17","description":"..."}}`;

/**
 * Download a (possibly WATI-hosted, auth-gated) image and ask Claude
 * Vision to classify + extract it. Throws on network / API failure so
 * the caller can fall back gracefully.
 */
export async function scanDocumentImage(
  imageUrl: string
): Promise<ScannedDocument> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  // WATI media URLs require a Bearer token (same as scan-from-url).
  const headers: Record<string, string> = {};
  if (
    imageUrl.includes(process.env.WATI_BASE_URL || "wati.io") &&
    process.env.WATI_API_KEY
  ) {
    headers["Authorization"] = `Bearer ${process.env.WATI_API_KEY}`;
  }

  const res = await fetch(imageUrl, { headers });
  if (!res.ok) throw new Error(`failed to fetch image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mediaType = (res.headers.get("content-type") || "image/jpeg").split(
    ";"
  )[0];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: DOC_SCAN_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: buf.toString("base64"),
              },
            },
            {
              type: "text",
              text: "סווג את המסמך וחלץ את הנתונים. החזר JSON בלבד.",
            },
          ],
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
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { doc_type: "other", invoice: null };

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ScannedDocument>;
    const docType: DocumentType =
      parsed.doc_type === "check" || parsed.doc_type === "invoice"
        ? parsed.doc_type
        : "other";

    if (docType !== "invoice" || !parsed.invoice) {
      return { doc_type: docType, invoice: null };
    }

    const inv = parsed.invoice;
    const amount =
      inv.amount != null && !Number.isNaN(Number(inv.amount))
        ? Number(inv.amount)
        : null;

    return {
      doc_type: "invoice",
      invoice: {
        supplier_name: inv.supplier_name ? String(inv.supplier_name) : null,
        amount,
        invoice_number: inv.invoice_number
          ? String(inv.invoice_number)
          : null,
        invoice_date: inv.invoice_date ? String(inv.invoice_date) : null,
        due_date: inv.due_date ? String(inv.due_date) : null,
        description: inv.description ? String(inv.description) : null,
      },
    };
  } catch {
    return { doc_type: "other", invoice: null };
  }
}
