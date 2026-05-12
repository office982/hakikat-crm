import { NextRequest, NextResponse } from "next/server";
import { executeAction, issueReceipt } from "@/lib/whatsapp/execute-action";
import { resolveTenant } from "@/lib/whatsapp/resolve-tenant";
import { supabaseAdmin as supabase } from "@/lib/supabase";

interface ConfirmRequest {
  pending_id: string;
  decision: "confirm" | "reject";
}

/**
 * Confirm or reject a pending AI-agent action created by POST /api/ai-agent.
 *
 * On confirm we atomically flip status pending → confirmed, then run the
 * action and return the executor's Hebrew reply. On reject we mark it
 * rejected and return a cancellation message.
 *
 * Mirrors the WhatsApp confirmation flow in /api/webhooks/wati so the web
 * UI and WhatsApp produce identical results.
 */
export async function POST(request: NextRequest) {
  try {
    const { pending_id, decision } = (await request.json()) as ConfirmRequest;

    if (!pending_id || (decision !== "confirm" && decision !== "reject")) {
      return NextResponse.json(
        { error: "pending_id ו-decision נדרשים" },
        { status: 400 }
      );
    }

    // Reject — atomic update only if still pending.
    if (decision === "reject") {
      await supabase
        .from("pending_actions")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("id", pending_id)
        .eq("status", "pending");

      return NextResponse.json({
        success: true,
        message: "✋ בוטל.",
      });
    }

    // Confirm — atomically claim the action so double-clicks don't run it twice.
    const { data: claimed } = await supabase
      .from("pending_actions")
      .update({ status: "confirmed", resolved_at: new Date().toISOString() })
      .eq("id", pending_id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (!claimed) {
      // Either already resolved, expired, or doesn't exist.
      const { data: existing } = await supabase
        .from("pending_actions")
        .select("status")
        .eq("id", pending_id)
        .maybeSingle();

      if (existing?.status === "confirmed") {
        return NextResponse.json({
          success: true,
          message: "הפעולה כבר אושרה.",
        });
      }
      return NextResponse.json(
        { success: false, message: "הפעולה כבר טופלה או פגה." },
        { status: 409 }
      );
    }

    const actionData = (claimed.data || {}) as Record<string, unknown>;

    // Internal follow-up: issue receipt for a previously-recorded payment.
    if (claimed.action === "_issue_receipt") {
      const tenant = await resolveTenant(actionData);
      if (!tenant) {
        return NextResponse.json({
          success: false,
          message: "שגיאה — לא מצאתי את הדייר להנפקת קבלה.",
        });
      }
      const amount = Number(actionData.amount);
      const month = String(actionData.month || "");
      const result = await issueReceipt(tenant.id, amount, `שכר דירה — ${month}`);
      return NextResponse.json({
        success: result.success,
        message: result.message,
      });
    }

    const result = await executeAction({
      action: claimed.action,
      data: actionData,
      confirmation_needed: false,
      confirmation_message: "",
      response_message: "",
    });

    // After a successful payment, queue a follow-up "issue receipt?" prompt.
    let followUpId: string | null = null;
    if (claimed.action === "record_payment" && result.success) {
      const { data: followUp } = await supabase
        .from("pending_actions")
        .insert({
          phone: claimed.phone,
          sender_name: claimed.sender_name,
          action: "_issue_receipt",
          data: {
            tenant_name: actionData.tenant_name,
            amount: actionData.amount,
            month: actionData.month,
          },
          confirmation_message: "להוציא קבלה?",
          status: "pending",
        })
        .select("id")
        .single();
      followUpId = followUp?.id ?? null;
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      follow_up: followUpId
        ? { pending_id: followUpId, confirmation_message: "להוציא קבלה?" }
        : null,
    });
  } catch (error) {
    console.error("AI agent confirm error:", error);
    return NextResponse.json(
      { error: "שגיאה באישור הפעולה", details: String(error) },
      { status: 500 }
    );
  }
}
