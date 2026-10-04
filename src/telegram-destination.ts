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

// Only Telegram receives the credential. Never propagate provider errors containing it.
export async function verifyTelegramDestination(
  token: string,
  recipient: string,
) {
  try {
    const call = async (method: string, body: object) => {
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
      if (!response.ok || data.ok !== true)
        throw new Error("PROVIDER_REJECTED");
      return data.result;
    };
    const bot = await call("getMe", {});
    if (!bot?.is_bot || typeof bot.username !== "string")
      throw new Error("INVALID_BOT");
    const chat = await call("getChat", { chat_id: recipient });
    if (
      !Number.isSafeInteger(chat?.id) ||
      !["private", "group", "supergroup", "channel"].includes(chat.type)
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
