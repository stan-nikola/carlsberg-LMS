import { prisma } from "@/lib/prisma";

/**
 * Курс з блоками/модулями/уроками в порядку проходження — для плеєра
 * курсу (Курс -> Блок -> Модуль -> Екран). MVP-плеєр (див.
 * components/CoursePlayer.jsx) підтримує лише Lesson.type "info" і "quiz" —
 * акордеони/gate/streak-конфеті з legacy course-assortment.html свідомо не
 * переносили в цьому кроці (домовились розширювати після MVP). Блок сам по
 * собі не залікова одиниця (Enrollment рахується по курсу в цілому) — тут
 * лише групує модулі для навігації.
 */
export async function getCourseForPlayer(slug) {
  return prisma.course.findUnique({
    where: { slug },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        include: {
          modules: {
            orderBy: { order: "asc" },
            include: {
              lessons: { orderBy: { order: "asc" } },
            },
          },
        },
      },
    },
  });
}

export async function getEnrollmentForCourse(employeeId, courseId) {
  return prisma.enrollment.findUnique({
    where: { employeeId_courseId: { employeeId, courseId } },
  });
}

/**
 * "Розгортає" курс у плаский список екранів для плеєра: старт -> уроки
 * по блоках -> модулях за порядком -> завершення. Старт/завершення — це
 * chrome плеєра (рахує з Course.title/description і результатом), не Lesson.
 *
 * @param {{ blocks: { title: string, modules: { title: string, lessons: object[] }[] }[] }} course
 */
export function flattenLessons(course) {
  return course.blocks.flatMap((block) =>
    block.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({
        ...lesson,
        moduleTitle: module.title,
        blockId: block.id,
        blockTitle: block.title,
      }))
    )
  );
}

/** Усі модулі курсу пласким списком (без прив'язки до блоку) — зручно
 * там, де важливий лише перелік модулів, напр. для gating по
 * unlockAfterDays (див. app/courses/[slug]/page.js). */
export function flattenModules(course) {
  return course.blocks.flatMap((block) => block.modules);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * "Пауза між блоками": для кожного блоку курсу визначає, чи він зараз
 * доступний співробітнику. Перший блок — завжди. Кожен наступний — лише
 * якщо ПОПЕРЕДНІЙ складено (BlockCompletion.passed=true, склав усі тести
 * блоку — див. schema.prisma Block.cooldownDays) і минуло не менше
 * block.cooldownDays днів з моменту, як його склали.
 *
 * @param {{ blocks: { id: number, cooldownDays: number|null }[] }} course - blocks у порядку order
 * @param {Map<number, { passed: boolean, completedAt: Date }>} completionsByBlockId
 * @returns {Map<number, { available: boolean, unlocksAt: Date|null, waitingForPrevious: boolean }>}
 */
export function computeBlockAvailability(course, completionsByBlockId) {
  const result = new Map();
  const blocks = course.blocks;
  const now = new Date();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (i === 0) {
      result.set(block.id, { available: true, unlocksAt: null, waitingForPrevious: false });
      continue;
    }

    const prevCompletion = completionsByBlockId.get(blocks[i - 1].id);
    if (!prevCompletion || !prevCompletion.passed) {
      result.set(block.id, { available: false, unlocksAt: null, waitingForPrevious: true });
      continue;
    }

    const unlocksAt = block.cooldownDays ? addDays(prevCompletion.completedAt, block.cooldownDays) : null;
    const available = !unlocksAt || unlocksAt <= now;
    result.set(block.id, { available, unlocksAt: available ? null : unlocksAt, waitingForPrevious: false });
  }

  return result;
}
