import { z } from "zod";
import { ApiError } from "./errors.js";

export const telegramToken = z
  .string()
  .trim()
  .regex(/^\d{5,20}:[A-Za-z0-9_-]{30,100}$/);
export const telegramRecipient = z
  .string()
  .trim()
  .regex(/^(?:-?[1-9]\d{0,19}|@[A-Za-z][A-Za-z0-9_]{4,31})$/);

const chatTypes = ["private", "group", "supergroup", "channel"];

// Callers map every failure to their own ApiError so the token never reaches a response.
async function telegramCall(token: string, method: string, body: object) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  );
  const data: any = await response.json();
  if (!response.ok || data.ok !== true) throw new Error("PROVIDER_REJECTED");
  return data.result;
}

export async function discoverTelegramChats(token: string) {
  try {
    const webhook = await telegramCall(token, "getWebhookInfo", {});
    if (webhook?.url)
      throw new ApiError(
        409,
        "TELEGRAM_EXISTING_WEBHOOK",
        "บอตนี้เชื่อมกับระบบอื่นอยู่ ให้กรอก Chat ID เอง หรือใช้ @ชื่อช่องสาธารณะ ระบบจะไม่เปลี่ยนการเชื่อมต่อเดิมของบอต",
      );
    // No offset or allowed_updates: do not acknowledge or reconfigure the bot's updates.
    const updates = await telegramCall(token, "getUpdates", { timeout: 0, limit: 100 });
    if (!Array.isArray(updates)) throw new Error("INVALID_UPDATES");
    const chats = new Map<
      string,
      { id: string; label: string; type: string }
    >();
    for (const update of updates) {
      const chat = (
        update.message ??
        update.channel_post ??
        update.my_chat_member
      )?.chat;
      if (
        !Number.isSafeInteger(chat?.id) ||
        !chatTypes.includes(chat.type)
      )
        continue;
      const id = String(chat.id);
      chats.set(id, {
        id,
        type: chat.type,
        label: String(
          chat.title ?? chat.first_name ?? chat.username ?? id,
        ).slice(0, 100),
      });
    }
    return [...chats.values()];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      400,
      "TELEGRAM_CHAT_SEARCH_FAILED",
      "ค้นหาแชตไม่ได้ ตรวจ Token แล้วลองใหม่ หากบอตทำงานกับระบบอื่นอยู่ ให้กรอก Chat ID เอง",
    );
  }
}

// Only Telegram receives the credential. Never propagate provider errors containing it.
export async function verifyTelegramDestination(
  token: string,
  recipient: string,
) {
  try {
    const bot = await telegramCall(token, "getMe", {});
    if (!bot?.is_bot || typeof bot.username !== "string")
      throw new Error("INVALID_BOT");
    const chat = await telegramCall(token, "getChat", { chat_id: recipient });
    if (
      !Number.isSafeInteger(chat?.id) ||
      !chatTypes.includes(chat.type)
    )
      throw new Error("INVALID_CHAT");
    return { username: bot.username, recipient: String(chat.id) };
  } catch {
    throw new ApiError(
      400,
      "TELEGRAM_CONNECT_FAILED",
      "ตรวจ Bot Token และ Chat ID ให้ถูกต้อง · แชตส่วนตัวต้องกด Start กับบอตของคุณก่อน · กลุ่มหรือช่องต้องเพิ่มบอตและให้สิทธิ์ส่งข้อความ",
    );
  }
}
