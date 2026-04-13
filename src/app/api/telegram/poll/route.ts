import { NextResponse } from "next/server";
import { callAIAgent } from "@/lib/api/claude";
import { sendMessage } from "@/lib/api/telegram";

const TELEGRAM_API = "https://api.telegram.org/bot";
let lastUpdateId = 0;

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

/**
 * Manual polling endpoint — call this to check for new messages.
 * In production, use webhook instead.
 */
export async function GET() {
  try {
    const token = getToken();
    if (!token) {
      return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
    }

    // Get updates
    const response = await fetch(
      `${TELEGRAM_API}${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=0`
    );
    const data = await response.json();

    if (!data.ok || !data.result?.length) {
      return NextResponse.json({ messages: 0 });
    }

    const results = [];

    for (const update of data.result) {
      lastUpdateId = update.update_id;

      if (!update.message?.text) continue;

      const chatId = update.message.chat.id;
      const text = update.message.text;
      const userName = [update.message.from?.first_name, update.message.from?.last_name]
        .filter(Boolean)
        .join(" ");

      // Handle /start
      if (text === "/start") {
        await sendMessage(
          chatId,
          `שלום ${userName}! 👋\n\nאני הסוכן החכם של קבוצת חקיקת.\nאפשר לדבר איתי בעברית פשוטה.\n\nלדוגמה:\n• "יוסי מלכה שילם 1500 עבור אפריל"\n• "מה היתרה של אברהם כהן?"\n• "שלח תזכורת תשלום לכל החייבים"\n\nפשוט כתוב מה שאתה צריך!`
        );
        results.push({ user: userName, text, response: "welcome" });
        continue;
      }

      // Process with AI
      try {
        const agentResponse = await callAIAgent(text);
        const reply = agentResponse.confirmation_needed
          ? `${agentResponse.confirmation_message}\n\nלאישור כתוב: ✅ כן\nלביטול כתוב: ❌ לא`
          : agentResponse.response_message;

        await sendMessage(chatId, reply);
        results.push({ user: userName, text, response: reply.substring(0, 100) });
      } catch {
        await sendMessage(chatId, "שגיאה בעיבוד הבקשה.");
        results.push({ user: userName, text, response: "error" });
      }
    }

    return NextResponse.json({ messages: results.length, results });
  } catch (error) {
    console.error("Telegram poll error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
