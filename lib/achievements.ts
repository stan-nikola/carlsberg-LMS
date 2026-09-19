import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { ensureAutoBadgesExist } from "@/lib/badgeRules";
import { getRules } from "@/lib/rating";
import { badgePoints } from "@/lib/ratingLogic";

// lib/prisma.js віддає `any` (синглтон через globalThis) — звужуємо, як і
// в lib/rating.ts.
const prisma = prismaUntyped as PrismaClient;

export type BadgeView = {
  id: number;
  title: string;
  icon: string | null;
  description: string | null;
  kind: string;
  /** Скільки балів відзнака дає РЕАЛЬНО — з урахуванням фолбеку
   *  manual_badge_default, а не саме поле Badge.points. */
  points: number;
  earned: boolean;
  awardedAt: Date | null;
};

/**
 * Усі типи ачивок + чи зароблена конкретним співробітником — для
 * AchievementsPanel.jsx (замінює попередній повністю хардкоджений список).
 * ensureAutoBadgesExist() — щоб авто-типи ("Перший вхід" тощо) були видні
 * навіть якщо cron ще жодного разу не прогнав нарахування.
 */
export async function getEmployeeBadgesView(employeeId: number): Promise<BadgeView[]> {
  await ensureAutoBadgesExist();
  const [allBadges, awarded, rules] = await Promise.all([
    prisma.badge.findMany({ orderBy: [{ kind: "asc" }, { title: "asc" }] }),
    prisma.employeeBadge.findMany({ where: { employeeId }, select: { badgeId: true, awardedAt: true } }),
    getRules(),
  ]);
  const awardedByBadgeId = new Map(awarded.map((a) => [a.badgeId, a.awardedAt]));
  // hiddenUntilEarned — іменні заслуги: у чужому списку не світяться навіть
  // «заблокованими», з'являються лише тому, кому видано.
  return allBadges
    .filter((b) => !b.hiddenUntilEarned || awardedByBadgeId.has(b.id))
    .map((b) => ({
      id: b.id,
      title: b.title,
      icon: b.icon,
      description: b.description,
      kind: b.kind,
      points: badgePoints(b, rules),
      earned: awardedByBadgeId.has(b.id),
      awardedAt: awardedByBadgeId.get(b.id) || null,
    }));
}

export type CertificateView = { slug: string; title: string; completedAt: Date; scorePercent: number | null };

/**
 * Сертифікати — СКЛАДЕНІ курси (Enrollment.passed, прохідний бал 80%+) з
 * увімкненим сертифікатом. Той самий поріг, що й у
 * app/api/courses/[slug]/certificate і у статусі сертифіката в плані курсу
 * (lib/coursePlan.ts) — до 2026-09-19 тут стояло рівно 100%, і в людини зі
 * складеними курсами секція лишалась майже порожньою (скарга користувача:
 * «Сертифікати должно быть больше»). Бал друкується в самому PDF, тож
 * нижчий поріг сертифікат не знецінює.
 */
export async function getEmployeeCertificates(employeeId: number): Promise<CertificateView[]> {
  const rows = await prisma.enrollment.findMany({
    where: { employeeId, status: "completed", passed: true, course: { certificateEnabled: true } },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true, scorePercent: true, course: { select: { slug: true, title: true } } },
  });
  return rows.map((r) => ({
    slug: r.course.slug,
    title: r.course.title,
    completedAt: r.completedAt as Date,
    scorePercent: r.scorePercent,
  }));
}
