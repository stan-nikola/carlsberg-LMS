import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getCourseForPlayer,
  getEnrollmentForCourse,
  flattenScreens,
  computeModuleAvailability,
} from "@/lib/courseContent";
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
  // якщо модуль N складено (ModuleCompletion.passed) і минула пауза.
  const completions = await prisma.moduleCompletion.findMany({ where: { enrollmentId: enrollment.id } });
  const completionsByModuleId = new Map(completions.map((c) => [c.moduleId, c]));
  const moduleAvailability = computeModuleAvailability(course, completionsByModuleId);

  // Послідовне відкриття екранів усередині доступного модуля: екран з
  // unlockAfterDays доступний лише через N днів після Enrollment.assignedAt
  // (календарний графік, не залежить від темпу проходження — див.
  // коментар у schema.prisma). Ще не відкриті екрани просто не потрапляють
  // у screens.
  const now = new Date();
  function screenUnlocksAt(unlockAfterDays) {
    if (!unlockAfterDays) return null;
    const d = new Date(enrollment.assignedAt);
    d.setDate(d.getDate() + unlockAfterDays);
    return d;
  }

  const availableModules = course.modules.filter((m) => moduleAvailability.get(m.id).available);
  const lockedScreenIds = new Set(
    flattenScreens({ modules: availableModules })
      .filter((s) => {
        const at = screenUnlocksAt(s.unlockAfterDays);
        return at && at > now;
      })
      .map((s) => s.id)
  );

  const courseWithAvailableContent = {
    ...course,
    modules: availableModules.map((courseModule) => ({
      ...courseModule,
      screens: courseModule.screens.filter((s) => !lockedScreenIds.has(s.id)),
    })),
  };

  const screens = flattenScreens(courseWithAvailableContent).map((screen) => ({
    id: screen.id,
    title: screen.title,
    moduleId: screen.moduleId,
    moduleTitle: screen.moduleTitle,
    components: screen.components,
  }));

  // Повідомлення про те, що ще недоступно — перший заблокований (екран
  // всередині доступного модуля АБО наступний модуль), у порядку проходження.
  let lockedNotice = null;
  const lockedScreen = flattenScreens({ modules: availableModules }).find((s) => lockedScreenIds.has(s.id));
  if (lockedScreen) {
    lockedNotice = `Наступний розділ курсу відкриється ${screenUnlocksAt(lockedScreen.unlockAfterDays).toLocaleDateString("uk-UA")}.`;
  } else {
    const nextLockedModule = course.modules.find((m) => !moduleAvailability.get(m.id).available);
    if (nextLockedModule) {
      const info = moduleAvailability.get(nextLockedModule.id);
      lockedNotice = info.waitingForPrevious
        ? `Модуль «${nextLockedModule.title}» відкриється після того, як ви складете попередній модуль.`
        : `Модуль «${nextLockedModule.title}» відкриється ${info.unlocksAt.toLocaleDateString("uk-UA")}.`;
    }
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
