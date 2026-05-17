import { NextRequest, NextResponse } from "next/server";
import { callAIAgent } from "@/lib/api/claude";
import { sendWhatsAppMessage } from "@/lib/api/wati";
import { executeAction, issueReceipt, handleWhatsAppCheckImage } from "@/lib/whatsapp/execute-action";
import { resolveTenant } from "@/lib/whatsapp/resolve-tenant";
import { scanDocumentImage, type ScannedInvoice } from "@/lib/whatsapp/scan-document";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import type { AIAgentResponse } from "@/lib/api/claude";

// Best-effort outbound send — logs but never throws. A WATI/Meta delivery
// failure on one message must not abort the rest of the webhook flow
// (e.g. ack failing should not prevent the real result from being sent).
async function safeSend(phone: string, message: string): Promise<boolean> {
  try {
    await sendWhatsAppMessage(phone, message);
    return true;
  } catch (err) {
    console.error("WATI send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

interface WatiWebhookPayload {
  waId: string;
  text: string;
  type: string;
  timestamp: string;
  senderName?: string;
  // Set when type = "image" / "document"
  data?: string;       // remote media URL
  caption?: string;    // optional caption text under the image
  mime_type?: string;
}

// Hebrew confirmation words
const CONFIRM_YES = ["כן", "אישור", "כ", "בטח", "יאללה", "אשר", "yes", "1", "✅", "v"];
const CONFIRM_NO = ["לא", "ביטול", "בטל", "no", "0", "❌", "x"];

/**
 * WATI Webhook — receives incoming WhatsApp messages.
 *
 * Flow:
 *  1. Image/document → Claude Vision classifies it:
 *      a. check   → check-scanning pipeline (handleWhatsAppCheckImage)
 *      b. invoice → extract fields, feed to AI agent with the caption,
 *                   then the normal confirmation flow
 *      c. other   → ask the user what to do with it
 *  2. Text "yes/no" while a pending action is open → run/cancel it
 *  3. Otherwise → call AI agent
 *      a. confirmation_needed → store pending_action, ask user
 *      b. else → execute directly, send result
 */
export async function POST(request: NextRequest) {
  let payload: WatiWebhookPayload;
  try {
    payload = (await request.json()) as WatiWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify webhook token. Accept header OR query param OR Authorization header.
  const expected = process.env.WATI_WEBHOOK_TOKEN;
  if (expected) {
    const provided =
      request.headers.get("x-webhook-token") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      request.nextUrl.searchParams.get("token");
    if (provided !== expected) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  const phone = payload.waId;
  if (!phone) {
    return NextResponse.json({ received: true, skipped: "no waId" });
  }

  try {
    // ── Image / document → classify, then route ──
    if ((payload.type === "image" || payload.type === "document") && payload.data) {
      const imageUrl = payload.data;
      const caption = payload.caption || payload.text || "";
      try {
        const doc = await scanDocumentImage(imageUrl);

        // Checks keep their dedicated multi-check pipeline (records the
        // check + payment + auto-issues a receipt).
        if (doc.doc_type === "check") {
          const result = await handleWhatsAppCheckImage({
            phone,
            imageUrl,
            caption,
            senderName: payload.senderName,
          });
          await safeSend(phone, result.message);
          return NextResponse.json({ received: true, action: "image_check" });
        }

        // Couldn't make sense of the image at all.
        if (doc.doc_type !== "invoice" || !doc.invoice) {
          await safeSend(
            phone,
            "📸 קיבלתי תמונה אבל לא זיהיתי אם זה צ'ק או חשבונית. אם זה צ'ק — שלח עם כיתוב כמו \"צ'ק של יוסי כהן\". אם זו חשבונית — כתוב מה לעשות איתה (למשל \"תוסיף לפרויקט X\")."
          );
          return NextResponse.json({ received: true, action: "image_unknown" });
        }

        // Invoice → let the AI agent decide the action from the caption +
        // the extracted fields, then run it through the normal flow.
        const prompt = buildInvoiceAgentPrompt(doc.invoice, caption);
        let agentResponse: AIAgentResponse;
        try {
          agentResponse = await callAIAgent(prompt);
        } catch (aiErr) {
          console.error("AI Agent error (invoice):", aiErr);
          await safeSend(phone, "⚠️ שגיאה בעיבוד החשבונית — נסה שוב בעוד רגע.");
          return NextResponse.json({ error: "AI agent failed" }, { status: 500 });
        }

        // Carry the original media URL + parsed fields into the action so
        // the expense stores them (survives the pending-action round-trip).
        agentResponse.data = {
          ...agentResponse.data,
          invoice_image_url: imageUrl,
          invoice_number:
            agentResponse.data.invoice_number ?? doc.invoice.invoice_number,
          invoice_date:
            agentResponse.data.invoice_date ?? doc.invoice.invoice_date,
          due_date: agentResponse.data.due_date ?? doc.invoice.due_date,
        };

        await dispatchAgentResponse(phone, payload.senderName, agentResponse);
        return NextResponse.json({ received: true, action: agentResponse.action });
      } catch (err) {
        console.error("image handling failed:", err);
        await safeSend(
          phone,
          "⚠️ לא הצלחתי לעבד את התמונה — נסה שוב, או שלח שוב עם כיתוב שמסביר מה לעשות."
        );
        return NextResponse.json({ received: true, action: "image_error" });
      }
    }

    // Only process text messages from here on
    if (payload.type !== "text" || !payload.text) {
      return NextResponse.json({ received: true });
    }

    const text = payload.text.trim();
    if (!text) {
      return NextResponse.json({ received: true });
    }

    console.log(`WhatsApp from ${phone}: ${text}`);

    // ── Step 1: Pending confirmation? ──
    const handled = await handleConfirmationReply(phone, text);
    if (handled) {
      return NextResponse.json({ received: true, action: "confirmation_handled" });
    }

    // ── Step 2: AI agent ──
    let agentResponse;
    try {
      agentResponse = await callAIAgent(text);
    } catch (aiErr) {
      console.error("AI Agent error:", aiErr);
      await safeSend(phone, "⚠️ שגיאה בעיבוד ההודעה — נסה שוב בעוד רגע.");
      return NextResponse.json({ error: "AI agent failed" }, { status: 500 });
    }

    await dispatchAgentResponse(phone, payload.senderName, agentResponse);
    return NextResponse.json({ received: true, action: agentResponse.action });
  } catch (error) {
    console.error("WATI webhook error:", error);
    await safeSend(phone, "⚠️ שגיאה במערכת — נסה שוב.");
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * Run an AI agent response through the standard delivery flow:
 *  - confirmation_needed → store a pending_action and ask "כן / לא"
 *  - else → ack message first, then the executor's real result
 * Shared by the text path and the invoice-image path.
 */
async function dispatchAgentResponse(
  phone: string,
  senderName: string | undefined,
  agentResponse: AIAgentResponse
): Promise<void> {
  if (agentResponse.confirmation_needed) {
    const summary =
      agentResponse.confirmation_message ||
      agentResponse.response_message ||
      "האם לאשר את הפעולה?";

    await supabase.from("pending_actions").insert({
      phone,
      sender_name: senderName || null,
      action: agentResponse.action,
      data: agentResponse.data,
      confirmation_message: summary,
      status: "pending",
    });

    await safeSend(phone, `${summary}\n\nענה: כן / לא`);
    return;
  }

  // Two-message reply: acknowledgement first, then the executor's real
  // result. A failed ack must not block the real result.
  const ack = agentResponse.response_message?.trim();
  if (ack && ack.length < 200) {
    await safeSend(phone, ack);
  }
  const result = await executeAction(agentResponse);
  if (!ack || result.message !== ack) {
    await safeSend(phone, result.message);
  }
}

/**
 * Render the Vision-extracted invoice fields + the user's caption into a
 * Hebrew message for the AI agent. The agent maps it to an action
 * (typically add_project_expense) using its normal rules — including the
 * "never guess, ask to clarify" golden rule when something is missing.
 */
function buildInvoiceAgentPrompt(
  invoice: ScannedInvoice,
  caption: string
): string {
  const f = (label: string, val: string | number | null) =>
    `• ${label}: ${val !== null && val !== "" ? val : "לא זוהה"}`;

  const captionLine = caption.trim()
    ? `הכיתוב שצורף לתמונה: "${caption.trim()}"`
    : "לא צורף כיתוב לתמונה.";

  return [
    "[הודעת תמונה] המשתמש שלח תמונת חשבונית/חשבון ספק בוואטסאפ.",
    captionLine,
    "",
    "פרטים שחולצו אוטומטית מהחשבונית (נתוני קלט אמינים):",
    f("ספק", invoice.supplier_name),
    f("סכום", invoice.amount),
    f("מספר חשבונית", invoice.invoice_number),
    f("תאריך חשבונית", invoice.invoice_date),
    f("תאריך לתשלום", invoice.due_date),
    f("תיאור", invoice.description),
    "",
    "בצע את מבוקש המשתמש לפי הכיתוב. אם הכיתוב מבקש להוסיף לפרויקט שעדיין",
    "לא קיים (\"פרויקט חדש\") — השתמש ב-add_project_expense עם",
    "create_project_if_missing: true ושם הפרויקט שצוין. אם פרט חובה לא",
    "זוהה מהתמונה וגם לא צוין בכיתוב — clarify.",
  ].join("\n");
}

/**
 * Check if the user's message is a yes/no reply to a pending action.
 * Returns true if handled, false if this is a new message.
 */
async function handleConfirmationReply(
  phone: string,
  text: string
): Promise<boolean> {
  const normalized = text.trim().toLowerCase();

  if (normalized.length > 20) return false;

  const isYes = CONFIRM_YES.some((w) => normalized === w || normalized.startsWith(`${w} `));
  const isNo = CONFIRM_NO.some((w) => normalized === w || normalized.startsWith(`${w} `));

  if (!isYes && !isNo) return false;

  const { data: pending } = await supabase
    .from("pending_actions")
    .select("*")
    .eq("phone", phone)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return false;

  // ── No — reject ──
  if (isNo) {
    await supabase
      .from("pending_actions")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("id", pending.id);

    await safeSend(phone, "✋ בוטל.");
    return true;
  }

  // ── Yes — atomically claim & execute ──
  const { data: claimed } = await supabase
    .from("pending_actions")
    .update({ status: "confirmed", resolved_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!claimed) return true;

  const actionData = pending.data as Record<string, unknown>;

  try {
    // Internal follow-up: issue receipt for a recently recorded payment.
    if (pending.action === "_issue_receipt") {
      const tenant = await resolveTenant(actionData);
      if (tenant) {
        const amount = Number(actionData.amount);
        const month = String(actionData.month || "");
        const result = await issueReceipt(tenant.id, amount, `שכר דירה — ${month}`);
        await sendWhatsAppMessage(phone, result.message);
      } else {
        await sendWhatsAppMessage(phone, "שגיאה — לא מצאתי את הדייר להנפקת קבלה.");
      }
      return true;
    }

    const result = await executeAction({
      action: pending.action,
      data: actionData,
      confirmation_needed: false,
      confirmation_message: "",
      response_message: "",
    });

    await sendWhatsAppMessage(phone, result.message);

    // After payment recorded → ask about receipt
    if (pending.action === "record_payment" && result.success) {
      await supabase.from("pending_actions").insert({
        phone,
        sender_name: pending.sender_name,
        action: "_issue_receipt",
        data: {
          tenant_name: actionData.tenant_name,
          amount: actionData.amount,
          month: actionData.month,
        },
        confirmation_message: "להוציא קבלה?",
        status: "pending",
      });
      // The executeAction response already ends with "להוציא קבלה?"
    }

    return true;
  } catch (execErr) {
    console.error("Confirmation execution failed:", execErr);
    await sendWhatsAppMessage(phone, "⚠️ שגיאה בביצוע הפעולה — נסה שוב או פנה למנהל.");
    return true;
  }
}
