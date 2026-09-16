import { NextResponse } from "next/server";
import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { isTelegramConfigured, replyToChat, telegramBotUsername } from "@/lib/telegram";
import { parseCommand, verifyLinkToken } from "@/lib/telegramLogic";

const prisma = prismaUntyped as PrismaClient;

/**
 * Webhook Telegram-бота (реєструється з /admin/notifications → «Увімкнути
 * webhook»). Telegram шле сюди кожне повідомлення боту з заголовком
 * X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET — інакше 401.
 *
 *  /start <token> — прив’язати чат до співробітника (deep link з профілю,
 *                   токен підписано SESSION_SECRET, lib/telegramLogic.ts)
 *  /stop          — відв’язати
 *  інше           — у журнал TelegramInbound (адмінка) + підказка
 *
 * Завжди 200: Telegram повторює апдейт, поки не отримає 200, і будь-яка
 * наша помилка інакше перетворилась би на нескінченні повтори.
 */
export async function POST(request: Request) {
  if (!isTelegramConfigured()) return NextResponse.json({ ok: false, reason: "not_configured" });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  const msg = update?.message;
  if (!msg?.chat?.id || typeof msg.text !== "string") return NextResponse.json({ ok: true });

  const chatId = String(msg.chat.id);
  const username: string | null = msg.from?.username || null;
  const firstName: string | null = msg.from?.first_name || null;

  try {
    const cmd = parseCommand(msg.text);
    if (cmd?.cmd === "start") {
      const employeeId = verifyLinkToken(cmd.arg, process.env.SESSION_SECRET || "");
      const employee = employeeId ? await prisma.employee.findFirst({ where: { id: employeeId, isActive: true }, select: { id: true } }) : null;
      if (!employee) {
        await replyToChat(
          chatId,
          "Посилання для підключення застаріло або невірне. Відкрийте профіль у CarLS і натисніть «Підключити Telegram» ще раз."
        );
        return NextResponse.json({ ok: true });
      }
      // Один чат — одна людина: якщо цей чат уже був у когось іншого
      // (спільний телефон, демо-вхід під іншим кодом) — переприв’язуємо.
      await prisma.$transaction([
        prisma.telegramLink.deleteMany({ where: { chatId, NOT: { employeeId: employee.id } } }),
        prisma.telegramLink.upsert({
          where: { employeeId: employee.id },
          update: { chatId, username, firstName, lastError: null },
          create: { employeeId: employee.id, chatId, username, firstName },
        }),
      ]);
      await replyToChat(chatId, "✅ Підключено! Сповіщення CarLS тепер приходитимуть сюди.\nВідключити — /stop або в профілі застосунку.");
      return NextResponse.json({ ok: true });
    }

    if (cmd?.cmd === "stop") {
      const { count } = await prisma.telegramLink.deleteMany({ where: { chatId } });
      await replyToChat(chatId, count ? "Відключено. Підключити знову можна в профілі CarLS." : "Цей чат і так не підключено.");
      return NextResponse.json({ ok: true });
    }

    const link = await prisma.telegramLink.findUnique({ where: { chatId }, select: { employeeId: true } });
    if (cmd?.cmd !== "help") {
      await prisma.telegramInbound.create({
        data: { chatId, employeeId: link?.employeeId ?? null, username, text: msg.text.slice(0, 1000) },
      });
    }
    await replyToChat(
      chatId,
      `Це бот сповіщень CarLS (@${telegramBotUsername()}): він надсилає курси, дедлайни та відзнаки, а відповіді тут не читає.\n` +
        (link ? "Відключити — /stop." : "Підключити — кнопка «Підключити Telegram» у профілі застосунку.")
    );
  } catch (err) {
    console.warn("[telegram] webhook", (err as Error)?.message);
  }
  return NextResponse.json({ ok: true });
}
