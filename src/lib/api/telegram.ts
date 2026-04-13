const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

function apiUrl(method: string) {
  return `${TELEGRAM_API}${getToken()}/${method}`;
}

/**
 * Send a text message to a Telegram chat.
 */
export async function sendMessage(chatId: string | number, text: string): Promise<void> {
  const response = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API error: ${response.status} — ${err}`);
  }
}

/**
 * Send a document (PDF) to a Telegram chat.
 */
export async function sendDocument(
  chatId: string | number,
  fileBuffer: Buffer,
  fileName: string,
  caption?: string
): Promise<void> {
  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append("document", new Blob([new Uint8Array(fileBuffer)]), fileName);
  if (caption) formData.append("caption", caption);

  const response = await fetch(apiUrl("sendDocument"), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram sendDocument error: ${response.status} — ${err}`);
  }
}

/**
 * Set the webhook URL for the bot.
 */
export async function setWebhook(url: string): Promise<void> {
  const response = await fetch(apiUrl("setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram setWebhook error: ${response.status} — ${err}`);
  }
}

/**
 * Get bot info.
 */
export async function getBotInfo(): Promise<{ id: number; first_name: string; username: string }> {
  const response = await fetch(apiUrl("getMe"));
  if (!response.ok) throw new Error("Failed to get bot info");
  const data = await response.json();
  return data.result;
}

/**
 * Send a payment reminder to a tenant.
 */
export async function sendPaymentReminder(
  chatId: string | number,
  tenantName: string,
  amount: number,
  month: string
): Promise<void> {
  const text = `שלום ${tenantName},\n\nתזכורת תשלום שכר דירה:\nסכום: ₪${amount.toLocaleString()}\nעבור חודש: ${month}\n\nאנא הסדר את התשלום.\nתודה,\nקבוצת חקיקת`;
  await sendMessage(chatId, text);
}

/**
 * Send a contract signing notification.
 */
export async function sendContractNotification(
  chatId: string | number,
  tenantName: string,
  unit: string
): Promise<void> {
  const text = `שלום ${tenantName},\n\nחוזה השכירות שלך עבור ${unit} מוכן לחתימה.\nאנא לחץ על הקישור שיישלח אליך לחתימה דיגיטלית.\n\nתודה,\nקבוצת חקיקת`;
  await sendMessage(chatId, text);
}
