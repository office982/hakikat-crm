import { NextRequest, NextResponse } from "next/server";
import { callAIAgent } from "@/lib/api/claude";
import { sendWhatsAppMessage } from "@/lib/api/wati";
import { executeAction, issueReceipt } from "@/lib/whatsapp/execute-action";
import { resolveTenant } from "@/lib/whatsapp/resolve-tenant";
import { supabase } from "@/lib/supabase";

interface WatiWebhookPayload {
  waId: string;
  text: string;
  type: string;
  timestamp: string;
  senderName?: string;
}

// Hebrew confirmation words
const CONFIRM_YES = ["כן", "אישור", "כ", "בטח", "יאללה", "אשר", "yes", "1"];
const CONFIRM_NO = ["לא", "ביטול", "בטל", "no", "0"];

/**
 * WATI Webhook — receives incoming WhatsApp messages.
 *
 * Full flow:
 * 1. Message arrives from WhatsApp
 * 2. Check if this is a confirmation reply (yes/no for a pending action)
 * 3. If confirmation — execute the stored pending action
 * 4. If new message — send to AI Agent
 *    a. If AI says confirmation_needed — store in pending_actions, ask user
 *    b. If no confirmation needed — execute directly, send response
 */
export async function POST(request: NextRequest) {
  try {
    const payload: WatiWebhookPayload = await request.json();

    // Verify webhook token
    const token = request.headers.get("x-webhook-token");
    if (token !== process.env.WATI_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Only process text messages
    if (payload.type !== "text" || !payload.text) {
      return NextResponse.json({ received: true });
    }

    const phone = payload.waId;
    const text = payload.text.trim();

    console.log(`WhatsApp from ${phone}: ${text}`);

    // ── Step 1: Check for pending confirmation ──
    const handled = await handleConfirmationReply(phone, text);
    if (handled) {
      return NextResponse.json({ received: true, action: "confirmation_handled" });
    }

    // ── Step 2: Process new message with AI Agent ──
    let agentResponse;
    try {
      agentResponse = await callAIAgent(text);
    } catch (aiErr) {
      console.error("AI Agent error:", aiErr);
      await sendWhatsAppMessage(phone, "⚠️ שגיאה בעיבוד ההודעה — נסה שוב בעוד רגע.");
      return NextResponse.json({ error: "AI agent failed" }, { status: 500 });
    }

    if (agentResponse.confirmation_needed) {
      // Store pending action for later confirmation
      await supabase.from("pending_actions").insert({
        phone,
        sender_name: payload.senderName || null,
        action: agentResponse.action,
        data: agentResponse.data,
        confirmation_message: agentResponse.confirmation_message,
        status: "pending",
      });

      await sendWhatsAppMessage(phone, agentResponse.confirmation_message);
    } else {
      // Execute directly (queries, balance checks, etc.)
      const result = await executeAction(agentResponse);
      await sendWhatsAppMessage(phone, result.message);
    }

    return NextResponse.json({ received: true, action: agentResponse.action });
  } catch (error) {
    console.error("WATI webhook error:", error);
    // Try to notify user of failure
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.waId) {
        await sendWhatsAppMessage(body.waId, "⚠️ שגיאה במערכת — נסה שוב.");
      }
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

  // Only check short messages that look like confirmation replies
  if (normalized.length > 20) return false;

  const isYes = CONFIRM_YES.some((w) => normalized === w || normalized.startsWith(w));
  const isNo = CONFIRM_NO.some((w) => normalized === w || normalized.startsWith(w));

  if (!isYes && !isNo) return false;

  // Find the most recent pending action for this phone
  const { data: pending } = await supabase
    .from("pending_actions")
    .select("*")
    .eq("phone", phone)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

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

  // ── Yes — confirm & execute ──
  // Idempotency: atomically mark as confirmed — if already confirmed, skip
  const { data: updated } = await supabase
    .from("pending_actions")
    .update({ status: "confirmed", resolved_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id")
    .single();

  if (!updated) {
    // Already confirmed/rejected by a previous request — skip
    return true;
  }

  const actionData = pending.data as Record<string, unknown>;

  try {
    // Handle internal follow-up actions
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

    // Execute the regular action
    const agentResponse = {
      action: pending.action,
      data: actionData,
      confirmation_needed: false,
      confirmation_message: "",
      response_message: "",
    };

    const result = await executeAction(agentResponse);
    await sendWhatsAppMessage(phone, result.message);

    // ── Post-action: chain follow-up confirmations ──

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
