import { after } from "next/server";
import type { Prisma, PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { getAdminLevel } from "@/lib/adminSession";
import { isManagerTier } from "@/lib/permissions";
import { DAY_MS } from "@/lib/kyivTime";

const prisma = prismaUntyped as PrismaClient;

/**
 * Журнал дій платформи (AuditLog, /admin/audit). Усе best-effort: помилка
 * журналу ніколи не ламає саму дію — журнал вторинний до бізнес-операції.
 *
 * action — "<розділ>.<дія>": адмінка — enrollment.update, badge.award …;
 * співробітники (2026-10-04) — auth.*, learning.*, manager.*, profile.*,
 * activity.visit; cron — system.*. Підписи для UI — components/AdminAudit.jsx.
 *
 * actor: "super" | "admin" — рівень admin_session (вхід спільним паролем, імені
 * людини немає); "manager" | "employee" — сесія співробітника (+ actorEmployeeId);
 * "system" — cron.
 */
export type AuditActor = "super" | "admin" | "manager" | "employee" | "system";

async function write(data: Prisma.AuditLogUncheckedCreateInput) {
  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    console.warn("[audit]", data.action, (err as Error)?.message);
  }
}

const toId = (id: number | string | null | undefined) => (id == null || !Number.isFinite(Number(id)) ? null : Number(id));
const toJson = (details: unknown) => (details === undefined ? undefined : (details as Prisma.InputJsonValue));

/** Дія з адмінки — актор = рівень поточної admin_session (адмін чи супер-адмін). */
export async function audit(action: string, targetType: string, targetId?: number | string | null, details?: unknown) {
  const level = await getAdminLevel().catch(() => null);
  await write({ actor: level === "super" ? "super" : "admin", action, targetType, targetId: toId(targetId), details: toJson(details) });
}

/** Те саме з явним актором — коли сесії ще/вже нема (вхід і вихід з адмінки). */
export async function auditAs(actor: AuditActor, action: string, targetType: string, targetId?: number | null, details?: unknown) {
  await write({ actor, action, targetType, targetId: toId(targetId), details: toJson(details) });
}

/**
 * Дія співробітника — пишеться ПІСЛЯ відповіді (after()), щоб журнал не
 * додавав затримки до входу, відповіді на питання тощо. Роль (керівник чи
 * співробітник) — за посадою на момент дії.
 */
export function auditEmployee(
  who: number | { externalCode: string } | null | undefined,
  action: string,
  target?: { type: string; id?: number | string | null },
  details?: unknown
) {
  if (!who) return;
  after(async () => {
    // За кодом — на кроках входу, де id людини роуту не відомий (PIN-запит,
    // невдалий PIN); той самий регістронезалежний пошук, що й у lib/auth.js.
    const employee = await prisma.employee
      .findFirst({
        where: typeof who === "number" ? { id: who } : { externalCode: { equals: who.externalCode, mode: "insensitive" } },
        select: { id: true, position: { select: { level: true } } },
      })
      .catch(() => null);
    if (!employee) return;
    const employeeId = employee.id;
    await write({
      actor: isManagerTier(employee) ? "manager" : "employee",
      actorEmployeeId: employeeId,
      action,
      targetType: target?.type ?? "employee",
      targetId: toId(target ? target.id : employeeId),
      details: toJson(details),
    });
  });
}

// ------------------------------------------------------------ зберігання

const RETENTION_KEY = "audit-retention-days";
export const AUDIT_RETENTION_DEFAULT_DAYS = 180;
export const AUDIT_RETENTION_MIN_DAYS = 30;
export const AUDIT_RETENTION_MAX_DAYS = 3650;

/** Скільки днів зберігати записи співробітників і системи (дії адмінів — назавжди). */
export async function getAuditRetentionDays(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: RETENTION_KEY } }).catch(() => null);
  const days = Number((row?.value as { days?: unknown } | null)?.days);
  return Number.isInteger(days) ? days : AUDIT_RETENTION_DEFAULT_DAYS;
}

export async function setAuditRetentionDays(days: number) {
  await prisma.appSetting.upsert({
    where: { key: RETENTION_KEY },
    update: { value: { days } },
    create: { key: RETENTION_KEY, value: { days } },
  });
}

/**
 * Щоденний cron: прибрати записи співробітників, керівників і системи,
 * старші за термін зберігання. Дії адмінів (admin/super) не чіпаємо —
 * це аудит-слід змін у даних, він потрібен завжди.
 */
export async function purgeOldAuditEntries(now = new Date()) {
  const days = await getAuditRetentionDays();
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const { count } = await prisma.auditLog.deleteMany({
    where: { actor: { in: ["employee", "manager", "system"] }, createdAt: { lt: cutoff } },
  });
  return { retentionDays: days, removed: count };
}
