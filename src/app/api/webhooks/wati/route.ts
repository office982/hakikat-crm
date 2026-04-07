import { NextRequest, NextResponse } from "next/server";
import { callAIAgent } from "@/lib/api/claude";
import { sendWhatsAppMessage } from "@/lib/api/wati";

interface WatiWebhookPayload {
  waId: string;
  text: string;
  type: string;
  timestamp: string;
  senderName?: string;
}

/**
 * WATI Webhook — receives incoming WhatsApp messages.
 *
 * Flow:
 * 1. Receive message from WhatsApp
 * 2. Send to AI Agent for processing
 * 3. If confirmation needed — store pending action, send confirmation message
 * 4. If no confirmation needed — execute directly, send response
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

    console.log(`WhatsApp message from ${payload.waId}: ${payload.text}`);

    // Process with AI Agent
    const agentResponse = await callAIAgent(payload.text);

    if (agentResponse.confirmation_needed) {
      // TODO: Store pending action in Supabase for later confirmation
      // await supabase.from('pending_actions').insert({
      //   phone: payload.waId,
      //   action: agentResponse.action,
      //   data: agentResponse.data,
      //   created_at: new Date().toISOString(),
      // });

      await sendWhatsAppMessage(payload.waId, agentResponse.confirmation_message);
    } else {
      // TODO: Execute action directly
      // await executeAction(agentResponse);

      await sendWhatsAppMessage(payload.waId, agentResponse.response_message);
    }

    return NextResponse.json({ received: true, action: agentResponse.action });
  } catch (error) {
    console.error("WATI webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
