import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { getExportData } from "@/lib/managerDashboard";
import { PLATFORM_NAME } from "@/lib/branding";
import {
  statusLabel,
  fmtDate,
  fmtMinutes,
  medalEmoji,
  autoSheet,
  highlightPassColumn,
} from "@/lib/excelReport";

const ROLE_LABELS = { employee: "Співробітник", admin: "Адміністратор", hr_manager: "HR-менеджер" };

// GET /api/admin/export — Фаза B1 (статичний багатолистовий дамп бази,
// на відміну від Фази B3 нижче, яка буде живим Power Query-підключенням).
// Ті самі хелпери (autoSheet/highlightPassColumn/medalEmoji/statusLabel),
// що вже є в app/api/manager/export/route.js, тепер винесені в
// lib/excelReport.js саме для цього — не копіювати стиль вдруге.
// getExportData(employeeIds) — той самий виклик, що й manager-звіт, тут
// просто БЕЗ обмеження підлеглими одного керівника: усі співробітники.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const [allEmployees, courses] = await Promise.all([
    prisma.employee.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        externalCode: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        firstLoginAt: true,
        position: { select: { name: true } },
        territory: { select: { name: true } },
        manager: { select: { name: true, externalCode: true } },
      },
    }),
    prisma.course.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        category: true,
        isMandatory: true,
        deadlineDays: true,
        publishAt: true,
        _count: { select: { enrollments: true } },
      },
    }),
  ]);

  const allEmployeeIds = allEmployees.map((e) => e.id);
  const { enrollments, attempts, moduleCompletions } = await getExportData(allEmployeeIds);
  const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));

  const wb = new ExcelJS.Workbook();
  wb.creator = PLATFORM_NAME;
  wb.created = new Date();

  // ==================== 1. Співробітники ====================
  autoSheet(
    wb,
    "Співробітники",
    [
      { header: "Ім'я", key: "a", width: 26 },
      { header: "Код", key: "b", width: 12 },
      { header: "Email", key: "c", width: 28 },
      { header: "Роль", key: "d", width: 16 },
      { header: "Активний", key: "e", width: 10 },
      { header: "Посада", key: "f", width: 24 },
      { header: "Територія", key: "g", width: 22 },
      { header: "Керівник", key: "h", width: 26 },
      { header: "Код керівника", key: "i", width: 14 },
      { header: "Перший вхід", key: "j", width: 13 },
      { header: "Заведено", key: "k", width: 13 },
    ],
    allEmployees.map((emp) => ({
      a: emp.name,
      b: emp.externalCode,
      c: emp.email || "",
      d: ROLE_LABELS[emp.role] || emp.role,
      e: emp.isActive ? "Так" : "Ні",
      f: emp.position?.name || "",
      g: emp.territory?.name || "",
      h: emp.manager?.name || "",
      i: emp.manager?.externalCode || "",
      j: fmtDate(emp.firstLoginAt),
      k: fmtDate(emp.createdAt),
    }))
  );

  // ==================== 2. Курси ====================
  autoSheet(
    wb,
    "Курси",
    [
      { header: "Назва", key: "a", width: 38 },
      { header: "Тема", key: "b", width: 18 },
      { header: "Обов'язковий", key: "c", width: 13 },
      { header: "Дедлайн, днів", key: "d", width: 13 },
      { header: "Заплановано на", key: "e", width: 15 },
      { header: "Призначено людей", key: "f", width: 16 },
    ],
    courses.map((c) => ({
      a: c.title,
      b: c.category || "",
      c: c.isMandatory ? "Так" : "Ні",
      d: c.deadlineDays ?? "",
      e: fmtDate(c.publishAt),
      f: c._count.enrollments,
    }))
  );

  // ==================== 3. Призначення ====================
  const assignmentsWs = autoSheet(
    wb,
    "Призначення",
    [
      { header: "Ім'я", key: "a", width: 26 },
      { header: "Код", key: "b", width: 12 },
      { header: "Курс", key: "c", width: 38 },
      { header: "Статус", key: "d", width: 20 },
      { header: "Бал, %", key: "e", width: 10 },
      { header: "Складено", key: "f", width: 10 },
      { header: "Призначено", key: "g", width: 13 },
      { header: "Дедлайн", key: "h", width: 13 },
      { header: "Завершено", key: "i", width: 13 },
      { header: "Тривалість, хв", key: "j", width: 14 },
      { header: "Медаль", key: "k", width: 9 },
    ],
    enrollments.map((e) => ({
      a: e.employee.name,
      b: e.employee.externalCode,
      c: e.course.title,
      d: statusLabel(e.status, e.passed),
      e: e.scorePercent ?? "",
      f: e.passed == null ? "" : e.passed ? "Так" : "Ні",
      g: fmtDate(e.assignedAt),
      h: fmtDate(e.dueDate),
      i: fmtDate(e.completedAt),
      j: fmtMinutes(e.durationSeconds),
      k: medalEmoji(e.scorePercent),
    }))
  );
  highlightPassColumn(assignmentsWs, "f");

  // ==================== 4. Модулі ====================
  const modulesWs = autoSheet(
    wb,
    "Модулі",
    [
      { header: "Ім'я", key: "a", width: 26 },
      { header: "Код", key: "b", width: 12 },
      { header: "Курс", key: "c", width: 38 },
      { header: "Модуль", key: "d", width: 38 },
      { header: "Бал, %", key: "e", width: 10 },
      { header: "Складено", key: "f", width: 10 },
      { header: "Дата", key: "g", width: 13 },
      { header: "Серія поспіль", key: "h", width: 13 },
      { header: "Медаль", key: "i", width: 9 },
    ],
    moduleCompletions.map((m) => {
      const enrollment = enrollmentById.get(m.enrollmentId);
      return {
        a: enrollment?.employee.name || "",
        b: enrollment?.employee.externalCode || "",
        c: enrollment?.course.title || "",
        d: m.module.title,
        e: m.scorePercent,
        f: m.passed ? "Так" : "Ні",
        g: fmtDate(m.completedAt),
        h: m.longestCorrectStreak ?? "",
        i: medalEmoji(m.scorePercent),
      };
    })
  );
  highlightPassColumn(modulesWs, "f");

  // ==================== 5. Спроби ====================
  const attemptsWs = autoSheet(
    wb,
    "Спроби",
    [
      { header: "Ім'я", key: "a", width: 26 },
      { header: "Код", key: "b", width: 12 },
      { header: "Курс", key: "c", width: 38 },
      { header: "Дата спроби", key: "d", width: 13 },
      { header: "Бал, %", key: "e", width: 10 },
      { header: "Складено", key: "f", width: 10 },
      { header: "Тривалість, хв", key: "g", width: 14 },
      { header: "Найдовша серія правильних", key: "h", width: 22 },
      { header: "Медаль", key: "i", width: 9 },
    ],
    attempts.map((a) => {
      const enrollment = enrollmentById.get(a.enrollmentId);
      return {
        a: enrollment?.employee.name || "",
        b: enrollment?.employee.externalCode || "",
        c: enrollment?.course.title || "",
        d: fmtDate(a.completedAt),
        e: a.scorePercent,
        f: a.passed ? "Так" : "Ні",
        g: fmtMinutes(a.durationSeconds),
        h: a.longestCorrectStreak,
        i: medalEmoji(a.scorePercent),
      };
    })
  );
  highlightPassColumn(attemptsWs, "f");

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `carls-baza-povna-${fmtDate(new Date())}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
