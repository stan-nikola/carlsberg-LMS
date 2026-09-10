import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getCourseForPlayer, getEnrollmentForCourse, flattenScreens, computeModuleAvailability } from "@/lib/courseContent";
import { CoursePlayer } from "@/components/CoursePlayer";

// Доступ лише призначеним (є Enrollment) — на відміну від legacy, де курс
// відкривався будь-кому із профілем платформи; тепер призначення явне
// (assignCourseToRole / адмін-ендпоінт із Кроку 2).
export default async function CoursePage({ params }) {
  const { slug } = await params;
  const employee = await getCurrentUser();
  if (!employee) redirect("/register");

  const course = await getCourseForPlayer(slug);
  if (!course) notFound();

  const enrollment = await getEnrollmentForCourse(employee.id, course.id);
  if (!enrollment) {
    return (
      <div className="stage">
        <div className="course-col">
          <div className="course-card">
            <div className="cp-viewport">
              <div className="cp-screen">
                <h2 className="cp-h2">Курс ще не призначено</h2>
                <p className="cp-lead">
                  Цей курс вам поки не призначено. Зверніться до вашого керівника або адміністратора.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // "Пауза між модулями" (Module.cooldownDays): модуль N+1 доступний лише
  // якщо модуль N складено (ModuleCompletion.passed) і минула пауза. Це
  // єдиний рівень календарного/послідовного гейтингу контенту курсу —
  // окреме "Відкриття через N днів" на рівні Screen свідомо прибрали
  // (2026-09, на запит користувача): для одного екрана всередині вже
  // доступного модуля така пауза зайва.
  const completions = await prisma.moduleCompletion.findMany({ where: { enrollmentId: enrollment.id } });
  const completionsByModuleId = new Map(completions.map((c) => [c.moduleId, c]));
  const moduleAvailability = computeModuleAvailability(course, completionsByModuleId);

  const availableModules = course.modules.filter((m) => moduleAvailability.get(m.id).available);
  const courseWithAvailableContent = { ...course, modules: availableModules };

  const screens = flattenScreens(courseWithAvailableContent).map((screen) => ({
    id: screen.id,
    title: screen.title,
    moduleId: screen.moduleId,
    moduleTitle: screen.moduleTitle,
    components: screen.components,
  }));

  // Повідомлення про наступний недоступний модуль (якщо є) — у порядку
  // проходження.
  let lockedNotice = null;
  const nextLockedModule = course.modules.find((m) => !moduleAvailability.get(m.id).available);
  if (nextLockedModule) {
    const info = moduleAvailability.get(nextLockedModule.id);
    lockedNotice = info.waitingForPrevious
      ? `Модуль «${nextLockedModule.title}» відкриється після того, як ви складете попередній модуль.`
      : `Модуль «${nextLockedModule.title}» відкриється ${info.unlocksAt.toLocaleDateString("uk-UA")}.`;
  }

  return (
    <CoursePlayer
      course={{
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        streakMessages: course.streakMessages,
      }}
      screens={screens}
      enrollmentId={enrollment.id}
      lockedNotice={lockedNotice}
    />
  );
}
