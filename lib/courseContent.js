import { prisma } from "@/lib/prisma";

/**
 * Курс з модулями/екранами/компонентами в порядку проходження — для плеєра
 * курсу (Курс -> Модуль -> Екран -> Компонент). Кожен Screen може тримати
 * кілька Component (питання, інфо, фото, поле вводу тощо), розставлених у
 * порядку — плеєр рендерить їх усі стеком на одному кроці (див.
 * components/CoursePlayer.jsx). Модуль сам по собі не залікова одиниця
 * (Enrollment рахується по курсу в цілому) — тут лише групує екрани для
 * навігації.
 */
export async function getCourseForPlayer(slug) {
  return prisma.course.findUnique({
    where: { slug },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          screens: {
            orderBy: { order: "asc" },
            include: {
              components: { orderBy: { order: "asc" } },
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
 * "Розгортає" курс у плаский список ЕКРАНІВ для плеєра: старт -> екрани по
 * модулях за порядком -> завершення. Старт/завершення — це chrome плеєра
 * (рахує з Course.title/description і результатом), не Screen. Кожен
 * елемент результату — один "крок" плеєра (одна навігація "Далі"/"Назад"),
 * з прив'язаними moduleId/moduleTitle замість колишніх blockId/blockTitle —
 * сам Screen.components лишається як є, плеєр рендерить усі його
 * компоненти стеком на цьому одному кроці.
 *
 * @param {{ modules: { id: number, title: string, screens: { id: number, title: string, components: object[] }[] }[] }} course
 */
export function flattenScreens(course) {
  return course.modules.flatMap((courseModule) =>
    courseModule.screens.map((screen) => ({
      ...screen,
      moduleId: courseModule.id,
      moduleTitle: courseModule.title,
    }))
  );
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * "Пауза між модулями": для кожного модуля курсу визначає, чи він зараз
 * доступний співробітнику. Перший модуль — завжди. Кожен наступний — лише
 * якщо ПОПЕРЕДНІЙ складено (ModuleCompletion.passed=true, склав усі тести
 * модуля — див. schema.prisma Module.cooldownDays) і минуло не менше
 * module.cooldownDays днів з моменту, як його склали.
 *
 * @param {{ modules: { id: number, cooldownDays: number|null }[] }} course - modules у порядку order
 * @param {Map<number, { passed: boolean, completedAt: Date }>} completionsByModuleId
 * @returns {Map<number, { available: boolean, unlocksAt: Date|null, waitingForPrevious: boolean }>}
 */
export function computeModuleAvailability(course, completionsByModuleId) {
  const result = new Map();
  const modules = course.modules;
  const now = new Date();

  for (let i = 0; i < modules.length; i++) {
    const courseModule = modules[i];
    if (i === 0) {
      result.set(courseModule.id, { available: true, unlocksAt: null, waitingForPrevious: false });
      continue;
    }

    const prevCompletion = completionsByModuleId.get(modules[i - 1].id);
    if (!prevCompletion || !prevCompletion.passed) {
      result.set(courseModule.id, { available: false, unlocksAt: null, waitingForPrevious: true });
      continue;
    }

    const unlocksAt = courseModule.cooldownDays ? addDays(prevCompletion.completedAt, courseModule.cooldownDays) : null;
    const available = !unlocksAt || unlocksAt <= now;
    result.set(courseModule.id, { available, unlocksAt: available ? null : unlocksAt, waitingForPrevious: false });
  }

  return result;
}
