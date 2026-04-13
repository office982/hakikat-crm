import { NextRequest, NextResponse } from "next/server";
import { callAIAgent } from "@/lib/api/claude";
import { sendMessage } from "@/lib/api/telegram";

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { first_name?: string; last_name?: string };
    text?: string;
  };
}

/**
 * Telegram Bot Webhook — receives messages and processes with AI Agent.
 *
 * Flow:
 * 1. Receive message from Telegram
 * 2. Send to AI Agent for processing
 * 3. If confirmation needed — ask user to confirm
 * 4. If no confirmation — execute and respond
 */
export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();

    // Only process text messages
    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text;
    const userName = [update.message.from?.first_name, update.message.from?.last_name]
      .filter(Boolean)
      .join(" ");

    console.log(`Telegram message from ${userName} (${chatId}): ${text}`);

    // Handle /start command
    if (text === "/start") {
      await sendMessage(
        chatId,
        `שלום ${userName}! 👋\n\nאני הסוכן החכם של קבוצת חקיקת.\nאפשר לדבר איתי בעברית פשוטה.\n\nלדוגמה:\n• "יוסי מלכה שילם 1500 עבור אפריל"\n• "מה היתרה של אברהם כהן?"\n• "שלח תזכורת תשלום לכל החייבים"\n\nפשוט כתוב מה שאתה צריך!`
      );
      return NextResponse.json({ ok: true });
    }

    // Process with AI Agent
    try {
      const agentResponse = await callAIAgent(text);

      if (agentResponse.confirmation_needed) {
        await sendMessage(
          chatId,
          `${agentResponse.confirmation_message}\n\nלאישור כתוב: ✅ כן\nלביטול כתוב: ❌ לא`
        );
      } else {
        await sendMessage(chatId, agentResponse.response_message);
      }
    } catch {
      await sendMessage(
        chatId,
        "שגיאה בעיבוד הבקשה. ודא שה-API key של Claude מוגדר."
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
