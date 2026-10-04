import type { AuditLog, Prisma, PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";

const prisma = prismaUntyped as PrismaClient;

/**
 * Вибірка журналу дій (AuditLog) з фільтрами /admin/audit — одна для екрана
 * (app/api/admin/audit, сторінками) і для Excel (app/api/admin/audit/export,
 * усе за фільтрами): у файл потрапляє рівно те, що видно на екрані.
 */
export const AUDIT_ACTORS = ["super", "admin", "manager", "employee", "system"] as const;

/** Розділи журналу → умова на action (і на роль для «Адмінка»). */
const CATEGORY_WHERE: Record<string, Prisma.AuditLogWhereInput> = {
  auth: { OR: [{ action: { startsWith: "auth." } }, { action: { startsWith: "admin.log" } }] },
  learning: { action: { startsWith: "learning." } },
  manager: { action: { startsWith: "manager." } },
  profile: { action: { startsWith: "profile." } },
  activity: { action: { startsWith: "activity." } },
  system: { action: { startsWith: "system." } },
  admin: { actor: { in: ["admin", "super"] }, NOT: { action: { startsWith: "admin.log" } } },
};

export type AuditFilters = { actor?: string; category?: string; q?: string; employeeId?: number };

/** Лише відомі значення: решта параметрів ігнорується. */
export function parseAuditFilters(sp: URLSearchParams): AuditFilters {
  const out: AuditFilters = {};
  const actor = sp.get("actor");
  if (actor && (AUDIT_ACTORS as readonly string[]).includes(actor)) out.actor = actor;
  const category = sp.get("category");
  if (category && CATEGORY_WHERE[category]) out.category = category;
  const q = sp.get("q")?.trim().slice(0, 100);
  if (q) out.q = q;
  const employeeId = Number(sp.get("employeeId"));
  if (Number.isInteger(employeeId) && employeeId > 0) out.employeeId = employeeId;
  return out;
}

export async function auditWhere(f: AuditFilters): Promise<Prisma.AuditLogWhereInput> {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.actor) and.push({ actor: f.actor });
  if (f.category) and.push(CATEGORY_WHERE[f.category]);
  // Людина — і як той, хто діяв, і як той, над ким діяли (картка, призначення).
  if (f.employeeId) and.push({ OR: [{ actorEmployeeId: f.employeeId }, { targetType: "employee", targetId: f.employeeId }] });
  if (f.q) {
    const people = await prisma.employee.findMany({
      where: { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { externalCode: { contains: f.q, mode: "insensitive" } }] },
      select: { id: true },
      take: 200,
    });
    and.push({ OR: [{ action: { contains: f.q, mode: "insensitive" } }, { actorEmployeeId: { in: people.map((p) => p.id) } }] });
  }
  return { AND: and };
}

type Target = { label: string; href?: string };
export type AuditPerson = { id: number; name: string; externalCode?: string | null; position?: string | null };

/** Назви об'єктів замість «#id» — пачкою на кожен тип, не запитом на рядок. */
async function resolveTargets(rows: Pick<AuditLog, "targetType" | "targetId">[]) {
  const idsOf = (type: string) => [...new Set(rows.filter((r) => r.targetType === type && r.targetId != null).map((r) => r.targetId!))];
  const [employees, courses, enrollments, badges, modules] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: idsOf("employee") } }, select: { id: true, name: true } }),
    prisma.course.findMany({ where: { id: { in: idsOf("course") } }, select: { id: true, title: true } }),
    prisma.enrollment.findMany({
      where: { id: { in: idsOf("enrollment") } },
      select: { id: true, employeeId: true, employee: { select: { name: true } }, course: { select: { title: true } } },
    }),
    prisma.badge.findMany({ where: { id: { in: idsOf("badge") } }, select: { id: true, title: true } }),
    prisma.module.findMany({ where: { id: { in: idsOf("module") } }, select: { id: true, title: true } }),
  ]);
  const map = new Map<string, Target>();
  for (const e of employees) map.set(`employee:${e.id}`, { label: e.name, href: `/admin/employees/${e.id}` });
  for (const c of courses) map.set(`course:${c.id}`, { label: `«${c.title}»`, href: `/admin/courses/${c.id}` });
  for (const e of enrollments) map.set(`enrollment:${e.id}`, { label: `«${e.course.title}» · ${e.employee.name}`, href: `/admin/employees/${e.employeeId}` });
  for (const b of badges) map.set(`badge:${b.id}`, { label: `«${b.title}»` });
  for (const m of modules) map.set(`module:${m.id}`, { label: `модуль «${m.title}»` });
  return map;
}

/** Рядки журналу + хто (ім'я, посада, код) і над чим (назва, посилання). */
export async function enrichAuditRows(rows: AuditLog[]) {
  const personIds = [...new Set(rows.map((r) => r.actorEmployeeId).filter((id): id is number => id != null))];
  const [people, targets] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: personIds } },
      select: { id: true, name: true, externalCode: true, position: { select: { name: true } } },
    }),
    resolveTargets(rows),
  ]);
  const personById = new Map<number, AuditPerson>(
    people.map((p) => [p.id, { id: p.id, name: p.name, externalCode: p.externalCode, position: p.position?.name ?? null }])
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    actor: r.actor,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    details: r.details as Record<string, unknown> | null,
    person: r.actorEmployeeId != null ? personById.get(r.actorEmployeeId) ?? { id: r.actorEmployeeId, name: `#${r.actorEmployeeId}` } : null,
    target: r.targetId != null ? targets.get(`${r.targetType}:${r.targetId}`) ?? null : null,
  }));
}
