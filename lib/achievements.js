import { prisma } from "@/lib/prisma";
import { ensureAutoBadgesExist } from "@/lib/badgeRules";

/**
 * Усі типи ачивок + чи зароблена конкретним співробітником — для
 * AchievementsPanel.jsx (замінює попередній повністю хардкоджений список).
 * ensureAutoBadgesExist() — щоб авто-типи ("Перший вхід" тощо) були видні
 * навіть якщо cron ще жодного разу не прогнав нарахування.
 *
 * @param {number} employeeId
 * @returns {Promise<Array<{id:number,title:string,icon:string,description:string|null,kind:string,earned:boolean,awardedAt:Date|null}>>}
 */
export async function getEmployeeBadgesView(employeeId) {
  await ensureAutoBadgesExist();
  const [allBadges, awarded] = await Promise.all([
    prisma.badge.findMany({ orderBy: [{ kind: "asc" }, { title: "asc" }] }),
    prisma.employeeBadge.findMany({ where: { employeeId }, select: { badgeId: true, awardedAt: true } }),
  ]);
  const awardedByBadgeId = new Map(awarded.map((a) => [a.badgeId, a.awardedAt]));
  return allBadges.map((b) => ({
    id: b.id,
    title: b.title,
    icon: b.icon,
    description: b.description,
    kind: b.kind,
    points: b.points,
    earned: awardedByBadgeId.has(b.id),
    awardedAt: awardedByBadgeId.get(b.id) || null,
  }));
}

/**
 * Сертифікати — курси, складені рівно на 100% (той самий поріг, що
 * app/api/courses/[slug]/certificate), з увімкненим сертифікатом.
 * @returns {Promise<Array<{slug:string,title:string,completedAt:Date}>>}
 */
export async function getEmployeeCertificates(employeeId) {
  const rows = await prisma.enrollment.findMany({
    where: { employeeId, status: "completed", scorePercent: 100, course: { certificateEnabled: true } },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true, course: { select: { slug: true, title: true } } },
  });
  return rows.map((r) => ({ slug: r.course.slug, title: r.course.title, completedAt: r.completedAt }));
}
