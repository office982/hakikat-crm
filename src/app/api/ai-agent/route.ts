import { NextRequest, NextResponse } from "next/server";
import { callAIAgent, type AIAgentTurn } from "@/lib/api/claude";
import { executeAction } from "@/lib/whatsapp/execute-action";
import { supabaseAdmin as supabase } from "@/lib/supabase";

interface AIAgentRequest {
  message: string;
  session_id?: string;
  history?: AIAgentTurn[];
}

/**
 * Web AI-agent endpoint.
 *
 * Behaviour:
 *  - Accepts an optional rolling `history` for multi-turn context.
 *  - When the AI flags `confirmation_needed`, the action is stored in
 *    `pending_actions` and we return its id — the UI confirms it via
 *    /api/ai-agent/confirm.
 *  - Otherwise we run the action immediately and return the executor's
 *    real Hebrew reply (so query_balance / list_overdue / etc. return
 *    actual data, not just AI chatter).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AIAgentRequest;
    const message = body.message;
    const sessionId = body.session_id || "web-session";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "נדרשת הודעה בשדה message" },
        { status: 400 }
      );
    }

    const agentResponse = await callAIAgent(message, history);

    // Confirmation flow — persist a pending action and return its id.
    if (agentResponse.confirmation_needed) {
      const { data: pending, error } = await supabase
        .from("pending_actions")
        .insert({
          phone: `web:${sessionId}`,
          sender_name: "web",
          action: agentResponse.action,
          data: agentResponse.data,
          confirmation_message: agentResponse.confirmation_message,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) {
        console.error("pending_actions insert failed:", error);
        return NextResponse.json(
          { error: "שגיאה בשמירת הפעולה לאישור" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        kind: "confirmation",
        pending_id: pending.id,
        action: agentResponse.action,
        confirmation_message: agentResponse.confirmation_message,
      });
    }

    // Direct execution (queries, balance lookups, reports, …).
    const result = await executeAction(agentResponse);

    return NextResponse.json({
      kind: "result",
      action: agentResponse.action,
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error("AI Agent error:", error);
    return NextResponse.json(
      { error: "שגיאה בעיבוד הבקשה", details: String(error) },
      { status: 500 }
    );
  }
}
