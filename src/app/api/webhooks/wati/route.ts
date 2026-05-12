import { NextRequest, NextResponse } from "next/server";
import { callAIAgent } from "@/lib/api/claude";
import { sendWhatsAppMessage } from "@/lib/api/wati";
import { executeAction, issueReceipt, handleWhatsAppCheckImage } from "@/lib/whatsapp/execute-action";
import { resolveTenant } from "@/lib/whatsapp/resolve-tenant";
import { supabaseAdmin as supabase } from "@/lib/supabase";

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
 *  1. Image/document → check-scanning pipeline
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
    // ── Image / document → check scanning flow ──
    if ((payload.type === "image" || payload.type === "document") && payload.data) {
      try {
        const result = await handleWhatsAppCheckImage({
          phone,
          imageUrl: payload.data,
          caption: payload.caption || payload.text || "",
          senderName: payload.senderName,
        });
        await sendWhatsAppMessage(phone, result.message);
      } catch (err) {
        console.error("image handling failed:", err);
        await sendWhatsAppMessage(
          phone,
          "⚠️ לא הצלחתי לעבד את התמונה — נסה שוב או שלח שוב עם שם הדייר בכיתוב."
        );
      }
      return NextResponse.json({ received: true, action: "image_handled" });
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
      await sendWhatsAppMessage(phone, "⚠️ שגיאה בעיבוד ההודעה — נסה שוב בעוד רגע.");
      return NextResponse.json({ error: "AI agent failed" }, { status: 500 });
    }

    if (agentResponse.confirmation_needed) {
      const summary =
        agentResponse.confirmation_message ||
        agentResponse.response_message ||
        "האם לאשר את הפעולה?";

      await supabase.from("pending_actions").insert({
        phone,
        sender_name: payload.senderName || null,
        action: agentResponse.action,
        data: agentResponse.data,
        confirmation_message: summary,
        status: "pending",
      });

      await sendWhatsAppMessage(phone, `${summary}\n\nענה: כן / לא`);
    } else {
      // Two-message reply for WhatsApp too: acknowledgement first, then the
      // executor's real result, so the user sees the bot reacting before the
      // data lookup finishes.
      const ack = agentResponse.response_message?.trim();
      if (ack && ack.length < 200) {
        await sendWhatsAppMessage(phone, ack);
      }
      const result = await executeAction(agentResponse);
      if (!ack || result.message !== ack) {
        await sendWhatsAppMessage(phone, result.message);
      }
    }

    return NextResponse.json({ received: true, action: agentResponse.action });
  } catch (error) {
    console.error("WATI webhook error:", error);
    try {
      await sendWhatsAppMessage(phone, "⚠️ שגיאה במערכת — נסה שוב.");
    } catch { /* best effort */ }
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
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

    await sendWhatsAppMessage(phone, "✋ בוטל.");
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
