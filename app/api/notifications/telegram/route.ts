import { NextResponse } from "next/server";
import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isTelegramConfigured, telegramBotUsername } from "@/lib/telegram";
import { deepLink, signLinkToken } from "@/lib/telegramLogic";

const prisma = prismaUntyped as PrismaClient;

/**
 * Telegram у профілі співробітника (components/NotificationSettings.jsx).
 *  GET    — стан: чи налаштовано бота, чи прив’язано чат, deep link для
 *           кнопки «Підключити» (токен на 15 хв, новий при кожному GET).
 *  DELETE — відв’язати.
 */
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configured = isTelegramConfigured();
  const link = configured
    ? await prisma.telegramLink.findUnique({
        where: { employeeId: employee.id },
        select: { username: true, firstName: true, linkedAt: true, lastSentAt: true },
      })
    : null;
  return NextResponse.json({
    configured,
    botUsername: telegramBotUsername(),
    link,
    linkUrl: configured && !link ? deepLink(telegramBotUsername(), signLinkToken(employee.id, process.env.SESSION_SECRET || "")) : null,
  });
}

export async function DELETE() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.telegramLink.deleteMany({ where: { employeeId: employee.id } });
  return NextResponse.json({ ok: true });
}
