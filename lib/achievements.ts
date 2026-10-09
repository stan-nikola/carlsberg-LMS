import type { PrismaClient } from "@/app/generated/prisma";
import { unstable_cache } from "next/cache";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { getRules } from "@/lib/rating";
import { badgePoints } from "@/lib/ratingLogic";
import { certificateEarned } from "@/lib/progress";

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
 * Авто-типи («Перший вхід» тощо) заводить ensureAutoBadgesExist() у щоденному
 * cron і в адмінці відзнак — не тут: на екрані перегляду це був запис у базу
 * на кожному промаху кешу (аудит запитів, 2026-10-03).
 */
async function computeEmployeeBadgesView(employeeId: number): Promise<BadgeView[]> {
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

// revalidate:60 — той самий проміжок, що вже прийнятий для design-tokens
// (lib/designSettings.ts) і lib/rating.ts (аудит швидкодії, 2026-09-19):
// відзнаки нараховуються подіями (щоденний cron, ручна видача), не
// щосекунди, тож хвилинна затримка на екрані "Досягнення" непомітна.
const cachedEmployeeBadgesView = unstable_cache(computeEmployeeBadgesView, ["employee-badges"], {
  revalidate: 60,
  tags: ["badges"],
});

export async function getEmployeeBadgesView(employeeId: number): Promise<BadgeView[]> {
  return cachedEmployeeBadgesView(employeeId);
}

export type CertificateView = { slug: string; title: string; completedAt: Date; scorePercent: number | null };

/**
 * Сертифікати — курси з увімкненим сертифікатом, де виконано правило
 * lib/progress.ts certificateEarned (кожен модуль на 100%). Той самий
 * вердикт дає PDF-роут, картка курсу, план і фінальний екран плеєра.
 */
async function computeEmployeeCertificates(employeeId: number): Promise<CertificateView[]> {
  const rows = await prisma.enrollment.findMany({
    where: { employeeId, status: "completed", scorePercent: 100, course: { certificateEnabled: true } },
    orderBy: { completedAt: "desc" },
    select: {
      status: true,
      completedAt: true,
      scorePercent: true,
      moduleCompletions: { select: { moduleId: true, scorePercent: true } },
      course: { select: { slug: true, title: true, modules: { select: { id: true } } } },
    },
  });
  const earned = rows.filter((r) => {
    const scoreOf = new Map(r.moduleCompletions.map((c) => [c.moduleId, c.scorePercent]));
    return certificateEarned(r, r.course.modules.map((m) => scoreOf.get(m.id)));
  });
  return earned.map((r) => ({
    slug: r.course.slug,
    title: r.course.title,
    completedAt: r.completedAt as Date,
    scorePercent: r.scorePercent,
  }));
}

// Один запит, але завжди в тому самому Promise.all, що й cachedEmployeeBadgesView/
// cachedLeaderboard на "Досягнення" (аудит швидкодії, 2026-09-19) — той
// самий revalidate:60, щоб не лишатись єдиним некешованим викликом у
// парі й не тягнути час найповільнішого разом з рештою.
const cachedEmployeeCertificates = unstable_cache(computeEmployeeCertificates, ["employee-certificates"], {
  revalidate: 60,
  tags: ["certificates"],
});

export async function getEmployeeCertificates(employeeId: number): Promise<CertificateView[]> {
  return cachedEmployeeCertificates(employeeId);
}
