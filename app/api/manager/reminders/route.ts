import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { auditEmployee } from "@/lib/audit";
import { sendManagerReminder } from "@/lib/managerReminders";

/**
 * POST /api/manager/reminders — «Нагадати» з кабінету керівника
 * (/manager, /manager/team): {employeeIds:number[], courseId:number|null,
 * message:string}. Іде тим самим notifyEmployees, що й cron-нагадування
 * (центр + push + Telegram, з повагою до вподобань адресата).
 *
 * Уся логіка — lib/managerReminders.ts sendManagerReminder(); тут лише
 * cookie-авторизація. Той самий шлях без сесії (initData) — Mini App,
 * app/api/tg/remind/route.ts.
 */
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Parameters<typeof sendManagerReminder>[1];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const result = await sendManagerReminder(me, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  auditEmployee(me.id, "manager.remind", body.courseId ? { type: "course", id: Number(body.courseId) } : undefined, {
    recipients: Array.isArray(body.employeeIds) ? body.employeeIds.length : 0,
    sent: result.sent,
    message: String(body.message ?? "").slice(0, 200),
  });
  return NextResponse.json({ sent: result.sent, skipped: result.skipped });
}
