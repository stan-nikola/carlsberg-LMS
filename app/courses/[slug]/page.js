import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getCourseForPlayer,
  getEnrollmentForCourse,
  flattenScreens,
  computeModuleAvailability,
  getPlayableModules,
} from "@/lib/courseContent";
import { CoursePlayer } from "@/components/CoursePlayer";
import { CourseReview } from "@/components/CourseReview";

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

  // "Пауза перед повторним проходженням" (Module.retakeCooldownDays):
  // модулі, які вже складено (passed) і пауза перепроходження ще не
  // минула, сюди НЕ потрапляють — плеєр більше не змушує переграти вже
  // складене з нуля щоразу, як людина заходить у курс (реальна скарга
  // користувача: "кнопка знову відкриває пройдений модуль").
  const playableModules = getPlayableModules(course, completionsByModuleId);

  // Немає жодного модуля, який зараз варто (пере)проходити, але щось уже
  // реально складено — курс повністю пройдено, і всі паузи перепроходження
  // ще діють. Замість плеєра — курс-методичка (тільки контент, без
  // тестів/гейтів): швидко підглянути/повторити матеріал.
  if (playableModules.length === 0 && completions.length > 0) {
    return <CourseReview course={course} modules={course.modules} scorePercent={enrollment.scorePercent} />;
  }

  // Бал модулів, пропущених цього разу (уже складені раніше, пауза
  // перепроходження ще діє) — потрібен, щоб submitResult() у CoursePlayer
  // міг порахувати бал ВСЬОГО курсу, а не лише модулів цієї сесії.
  const playableModuleIds = new Set(playableModules.map((m) => m.id));
  const skippedModuleScores = course.modules
    .filter((m) => !playableModuleIds.has(m.id))
    .map((m) => {
      const completion = completionsByModuleId.get(m.id);
      if (!completion) return null;
      if (completion.scoreRaw != null && completion.scoreMax != null) {
        return { scoreRaw: completion.scoreRaw, scoreMax: completion.scoreMax };
      }
      // Легасі-рядок, записаний до появи scoreRaw/scoreMax на
      // ModuleCompletion, — best-effort реконструкція з реальної к-сті
      // питань модуля й округленого scorePercent (трохи менш точно за
      // оригінал, але краще, ніж узагалі загубити внесок цього модуля).
      const quizCount = m.screens.reduce((sum, s) => sum + s.components.filter((c) => c.type === "quiz").length, 0);
      return { scoreRaw: Math.round((completion.scorePercent / 100) * quizCount), scoreMax: quizCount };
    })
    .filter(Boolean);

  const courseWithPlayableContent = { ...course, modules: playableModules };

  const screens = flattenScreens(courseWithPlayableContent).map((screen) => ({
    id: screen.id,
    title: screen.title,
    moduleId: screen.moduleId,
    moduleTitle: screen.moduleTitle,
    components: screen.components,
  }));

  // Повідомлення про наступний недоступний модуль (якщо є) — у порядку
  // проходження. Стосується лише прогресивного гейта (ще не складено
  // попередній) — модулі, пропущені через паузу ПЕРЕПРОХОДЖЕННЯ, просто
  // тихо пропускаються (вони вже складені, пояснювати нічого не треба).
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
      skippedModuleScores={skippedModuleScores}
    />
  );
}
