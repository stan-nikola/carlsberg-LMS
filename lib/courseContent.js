import { prisma } from "@/lib/prisma";

/**
 * Курс з модулями/уроками в порядку проходження — для плеєра курсу.
 * MVP-плеєр (див. components/CoursePlayer.jsx) підтримує лише
 * Lesson.type "info" і "quiz" — акордеони/gate/streak-конфеті з legacy
 * course-assortment.html свідомо не переносили в цьому кроці (домовились
 * розширювати після MVP).
 */
export async function getCourseForPlayer(slug) {
  return prisma.course.findUnique({
    where: { slug },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: { orderBy: { order: "asc" } },
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
 * по модулях за порядком -> завершення. Старт/завершення — це chrome
 * плеєра (рахує з Course.title/description і результатом), не Lesson.
 */
export function flattenLessons(course) {
  return course.modules.flatMap((module) =>
    module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))
  );
}
