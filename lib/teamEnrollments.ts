import { prisma } from "@/lib/prisma";

/**
 * Сирі дані команди для drill-down дашборда /manager (lib/teamInsights.ts
 * робить із них рядки «людина × курс»). Один виклик — чотири запити по
 * всьому піддереву керівника; сюди свідомо не входять екрани/компоненти
 * курсів (componentCount у плані не впливає на schedule.status).
 */

export type RawEmployee = {
  id: number;
  name: string;
  /** Код співробітника (TECH0071) — керівник знає людей саме по ньому. */
  externalCode: string | null;
  avatarUrl: string | null;
  managerId: number | null;
  isActive: boolean;
  lastSeenAt: Date | null;
  position: { code: string; name: string; level: number } | null;
};

export type RawEnrollment = {
  id: number;
  employeeId: number;
  courseId: number;
  status: string;
  assignedAt: Date;
  dueDate: Date | null;
  completedAt: Date | null;
  scorePercent: number | null;
  passed: boolean | null;
};

export type RawCourseModule = {
  id: number;
  title: string;
  order: number;
  cooldownDays: number | null;
  retakeCooldownDays: number | null;
  retryFreeAttempts: number | null;
  retryCooldownHours: number | null;
};

export type RawCourse = {
  id: number;
  title: string;
  slug: string;
  isMandatory: boolean;
  moduleDays: number | null;
  modulePauseDays: number | null;
  retryFreeAttempts: number | null;
  retryCooldownHours: number | null;
  modules: RawCourseModule[];
};

export type RawCompletion = {
  enrollmentId: number;
  moduleId: number;
  passed: boolean;
  scorePercent: number;
  completedAt: Date;
  attemptCount: number;
};

export type RawAttempt = {
  enrollmentId: number;
  completedAt: Date;
  passed: boolean;
};

export type TeamRaw = {
  employees: RawEmployee[];
  enrollments: RawEnrollment[];
  courses: RawCourse[];
  completions: RawCompletion[];
  attempts: RawAttempt[];
};

export async function fetchTeamRaw(employeeIds: number[]): Promise<TeamRaw> {
  if (employeeIds.length === 0) return { employees: [], enrollments: [], courses: [], completions: [], attempts: [] };

  const [employees, enrollments] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        name: true,
        externalCode: true,
        avatarUrl: true,
        managerId: true,
        isActive: true,
        lastSeenAt: true,
        position: { select: { code: true, name: true, level: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { employeeId: { in: employeeIds } },
      select: {
        id: true,
        employeeId: true,
        courseId: true,
        status: true,
        assignedAt: true,
        dueDate: true,
        completedAt: true,
        scorePercent: true,
        passed: true,
      },
    }),
  ]);

  const courseIds = Array.from(new Set(enrollments.map((e: RawEnrollment) => e.courseId)));
  const enrollmentIds = enrollments.map((e: RawEnrollment) => e.id);
  const [courses, completions, attempts] = await Promise.all([
    courseIds.length
      ? prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: {
            id: true,
            title: true,
            slug: true,
            isMandatory: true,
            moduleDays: true,
            modulePauseDays: true,
            retryFreeAttempts: true,
            retryCooldownHours: true,
            modules: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                title: true,
                order: true,
                cooldownDays: true,
                retakeCooldownDays: true,
                retryFreeAttempts: true,
                retryCooldownHours: true,
              },
            },
          },
        })
      : [],
    enrollmentIds.length
      ? prisma.moduleCompletion.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          select: { enrollmentId: true, moduleId: true, passed: true, scorePercent: true, completedAt: true, attemptCount: true },
        })
      : [],
    enrollmentIds.length
      ? prisma.enrollmentAttempt.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          select: { enrollmentId: true, completedAt: true, passed: true },
        })
      : [],
  ]);

  return {
    employees,
    enrollments: enrollments.map((e: RawEnrollment) => ({ ...e, status: String(e.status) })),
    courses,
    completions,
    attempts,
  };
}
