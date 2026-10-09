import { prisma } from "@/lib/prisma";
import { getSystemAdminId } from "@/lib/adminAuth";
import { recordBadgeAwards } from "@/lib/rating";
import { notifyBadgeAwarded } from "@/lib/notifications";

export type ManualAwardResult =
  | { error: "not_found" | "not_manual" }
  | { badge: { id: number; title: string; kind: string; points: number | null; icon: string | null; description: string | null }; awardedIds: number[] };

/**
 * Ручна видача відзнаки з /admin — і одній людині (картка співробітника), і
 * пачкою (сторінка відзнак). Лише kind=manual: автоматичні нараховує cron.
 * Хто вже має — пропускається (@@unique employeeId+badgeId). Бали рейтингу й
 * сповіщення — лише новим отримувачам і best-effort: збій доставки не
 * відкочує саму видачу. Автор — системний Employee (у /admin нема «свого»).
 */
export async function awardManualBadge(badgeId: number, employeeIds: number[], note: string | null): Promise<ManualAwardResult> {
  const badge = await prisma.badge.findUnique({
    where: { id: badgeId },
    select: { id: true, title: true, kind: true, points: true, icon: true, description: true },
  });
  if (!badge) return { error: "not_found" };
  if (badge.kind !== "manual") return { error: "not_manual" };

  const awardedById = await getSystemAdminId();
  const created = await prisma.employeeBadge.createManyAndReturn({
    data: employeeIds.map((employeeId) => ({ employeeId, badgeId: badge.id, awardedById, note })),
    skipDuplicates: true,
    select: { employeeId: true },
  });
  const awards = created.map((c) => ({ employeeId: c.employeeId, badge }));
  try {
    await recordBadgeAwards(awards);
  } catch (err) {
    console.warn("[rating] manual badge:", (err as Error)?.message);
  }
  try {
    await notifyBadgeAwarded(awards);
  } catch (err) {
    console.warn("[notifications] manual badge:", (err as Error)?.message);
  }
  return { badge, awardedIds: created.map((c) => c.employeeId) };
}

/** Текст 400 для спроби видати автоматичну відзнаку вручну — однаковий в обох роутах. */
export const NOT_MANUAL_MESSAGE = "Автоматичні відзнаки нараховує cron, вручну їх не видають";
