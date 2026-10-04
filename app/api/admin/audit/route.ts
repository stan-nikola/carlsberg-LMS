import { NextResponse } from "next/server";
import type { Prisma, PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { isSuperAdmin } from "@/lib/adminSession";
import {
  audit,
  AUDIT_RETENTION_MAX_DAYS,
  AUDIT_RETENTION_MIN_DAYS,
  getAuditRetentionDays,
  setAuditRetentionDays,
} from "@/lib/audit";

const prisma = prismaUntyped as PrismaClient;
const PAGE = 100;

const ACTORS = ["super", "admin", "manager", "employee", "system"] as const;

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

type Target = { label: string; href?: string } | null;

/** Назви об'єктів замість «#id» — пачкою на кожен тип, не запитом на рядок. */
async function resolveTargets(rows: { targetType: string; targetId: number | null }[]) {
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

/**
 * GET /api/admin/audit?actor=&category=&q=&employeeId=&cursor= — журнал дій
 * платформи (2026-10-04): адмінка, входи, навчання, дії керівників, профіль,
 * активність, cron. Сторінки по 100 (курсор — id). q шукає за ім'ям/кодом
 * людини і за назвою дії.
 */
export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(request.url).searchParams;

  const and: Prisma.AuditLogWhereInput[] = [];
  const actor = sp.get("actor");
  if (actor && (ACTORS as readonly string[]).includes(actor)) and.push({ actor });
  const category = sp.get("category");
  if (category && CATEGORY_WHERE[category]) and.push(CATEGORY_WHERE[category]);
  const employeeId = Number(sp.get("employeeId"));
  if (Number.isInteger(employeeId) && employeeId > 0) {
    // Людина — і як той, хто діяв, і як той, над ким діяли (картка, призначення).
    and.push({ OR: [{ actorEmployeeId: employeeId }, { targetType: "employee", targetId: employeeId }] });
  }
  const q = sp.get("q")?.trim().slice(0, 100);
  if (q) {
    const people = await prisma.employee.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { externalCode: { contains: q, mode: "insensitive" } }] },
      select: { id: true },
      take: 200,
    });
    and.push({ OR: [{ action: { contains: q, mode: "insensitive" } }, { actorEmployeeId: { in: people.map((p) => p.id) } }] });
  }
  const cursor = Number(sp.get("cursor"));
  if (Number.isInteger(cursor) && cursor > 0) and.push({ id: { lt: cursor } });

  const [rows, retentionDays, superAdmin] = await Promise.all([
    prisma.auditLog.findMany({ where: { AND: and }, orderBy: { id: "desc" }, take: PAGE + 1 }),
    getAuditRetentionDays(),
    isSuperAdmin(),
  ]);
  const page = rows.slice(0, PAGE);
  const personIds = [...new Set(page.map((r) => r.actorEmployeeId).filter((id): id is number => id != null))];
  const [people, targets] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: personIds } },
      select: { id: true, name: true, externalCode: true, position: { select: { name: true } } },
    }),
    resolveTargets(page),
  ]);
  const personById = new Map(people.map((p) => [p.id, { id: p.id, name: p.name, externalCode: p.externalCode, position: p.position?.name ?? null }]));

  return NextResponse.json({
    entries: page.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      actor: r.actor,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      details: r.details,
      person: r.actorEmployeeId != null ? personById.get(r.actorEmployeeId) ?? { id: r.actorEmployeeId, name: `#${r.actorEmployeeId}` } : null,
      target: r.targetId != null ? targets.get(`${r.targetType}:${r.targetId}`) ?? null : null,
    })),
    nextCursor: rows.length > PAGE ? page[page.length - 1].id : null,
    retentionDays,
    canEditRetention: superAdmin,
  });
}

/** PUT /api/admin/audit — { retentionDays } термін зберігання записів співробітників і системи. Лише супер-адмін. */
export async function PUT(request: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const days = Number(body?.retentionDays);
  if (!Number.isInteger(days) || days < AUDIT_RETENTION_MIN_DAYS || days > AUDIT_RETENTION_MAX_DAYS) {
    return NextResponse.json({ error: `Від ${AUDIT_RETENTION_MIN_DAYS} до ${AUDIT_RETENTION_MAX_DAYS} днів` }, { status: 400 });
  }
  const before = await getAuditRetentionDays();
  await setAuditRetentionDays(days);
  await audit("audit.retention", "audit", null, { from: before, to: days });
  return NextResponse.json({ retentionDays: days });
}
