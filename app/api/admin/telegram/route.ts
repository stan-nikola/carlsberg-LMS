import { NextResponse } from "next/server";
import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { audit } from "@/lib/audit";
import {
  appBaseUrl,
  getMe,
  getWebhookInfo,
  isTelegramConfigured,
  sendTelegramToEmployee,
  setWebhook,
  telegramBotUsername,
  webhookUrl,
} from "@/lib/telegram";

const prisma = prismaUntyped as PrismaClient;

/**
 * /admin/notifications → блок Telegram (components/AdminTelegram.tsx).
 *  GET    — стан бота (токен, @username, webhook), прив’язки, вхідні.
 *  POST   — { action: "webhook" } зареєструвати webhook на публічній адресі
 *           { action: "test", employeeId } тестове повідомлення людині
 *  DELETE — { employeeIds } відв’язати (одного або масово).
 */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const configured = isTelegramConfigured();
  const [links, inbound, me, webhook] = await Promise.all([
    prisma.telegramLink.findMany({
      orderBy: { linkedAt: "desc" },
      include: { employee: { select: { id: true, name: true, externalCode: true, position: { select: { name: true } } } } },
    }),
    prisma.telegramInbound.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { employee: { select: { name: true, externalCode: true } } },
    }),
    configured ? getMe() : null,
    configured ? getWebhookInfo() : null,
  ]);

  const base = appBaseUrl();
  return NextResponse.json({
    configured,
    webhookSecretSet: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    botUsername: me?.username || telegramBotUsername(),
    base,
    expectedWebhookUrl: base ? webhookUrl(base) : null,
    webhook: webhook?.ok ? webhook.result : null,
    webhookError: webhook && !webhook.ok ? webhook.description : null,
    links: links.map((l) => ({
      employeeId: l.employeeId,
      name: l.employee.name,
      externalCode: l.employee.externalCode,
      position: l.employee.position?.name || null,
      username: l.username,
      firstName: l.firstName,
      linkedAt: l.linkedAt,
      lastSentAt: l.lastSentAt,
      lastError: l.lastError,
    })),
    inbound: inbound.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      chatId: m.chatId,
      username: m.username,
      employee: m.employee ? `${m.employee.name} (${m.employee.externalCode})` : null,
      text: m.text,
    })),
  });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));

  if (body.action === "webhook") {
    // База — APP_URL / Vercel production URL; локально можна передати
    // свою (тунель) у body.base — Telegram не достукається до localhost.
    const base = typeof body.base === "string" && /^https:\/\//.test(body.base) ? body.base : appBaseUrl();
    if (!base) return NextResponse.json({ error: "Не знаю публічної адреси: задайте APP_URL" }, { status: 400 });
    const r = await setWebhook(base);
    if (!r.ok) return NextResponse.json({ error: r.description }, { status: 400 });
    await audit("telegram.webhook", "telegram", null, { url: webhookUrl(base) });
    return NextResponse.json({ ok: true, url: webhookUrl(base) });
  }

  if (body.action === "test") {
    const employeeId = Number(body.employeeId);
    if (!Number.isInteger(employeeId)) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
    const r = await sendTelegramToEmployee(employeeId, {
      title: "Тестове повідомлення",
      message: "Telegram підключено до CarLS — сповіщення приходитимуть сюди.",
      url: "/hub/notifications",
    });
    await audit("telegram.test", "telegram", employeeId, r);
    if (r.sent === 0) return NextResponse.json({ error: "reason" in r && r.reason === "not_linked" ? "Не підключено" : "Не доставлено — див. помилку в таблиці" }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.employeeIds) ? body.employeeIds.map(Number).filter(Number.isInteger) : [];
  if (ids.length === 0) return NextResponse.json({ error: "employeeIds is required" }, { status: 400 });
  const { count } = await prisma.telegramLink.deleteMany({ where: { employeeId: { in: ids } } });
  await audit("telegram.unlink", "telegram", ids.length === 1 ? ids[0] : null, { employeeIds: ids, removed: count });
  return NextResponse.json({ removed: count });
}
