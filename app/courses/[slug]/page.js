import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getCourseForPlayer,
  getEnrollmentForCourse,
  flattenScreens,
  getSessionModules,
  moduleCooldownDays,
} from "@/lib/courseContent";
import { buildCoursePlan, toPlanView } from "@/lib/coursePlan";
import { pickQuestionPool } from "@/lib/retryPolicy";
import { isScored } from "@/lib/componentTypes";
import { isManagerTier } from "@/lib/permissions";
import { CoursePlayer } from "@/components/CoursePlayer";
import { CourseReview } from "@/components/CourseReview";
import { XIcon } from "@/components/icons";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/** Скільки компонентів у модулі — з цього рахується орієнтовний час. У
 *  плеєрі модулі приходять із повним вмістом (screens[].components[]), а
 *  не з _count, як у хабі, тому рахуємо тут. */
function componentCount(courseModule) {
  return courseModule.screens.reduce((sum, screen) => sum + screen.components.length, 0);
}

// Доступ лише призначеним (є Enrollment) — на відміну від legacy, де курс
// відкривався будь-кому із профілем платформи; тепер призначення явне
// (assignCourseToRole / адмін-ендпоінт із Кроку 2).
export default async function CoursePage({ params, searchParams }) {
  const { slug } = await params;
  // ?module=<id> — людина сама обрала модуль у плані курсу
  // (components/CoursePlan.tsx). Раніше вибору не було взагалі: плеєр
  // мовчки вирішував, з чого почати (скарга користувача, 2026-09-17).
  const requestedModuleId = Number((await searchParams)?.module) || null;
  // Сторінка рахує доступність модулів від «зараз» (new Date() у
  // getSessionModules/buildCoursePlan) — це запит-час, а не пререндер;
  // без явного connection() валідатор Cache Components лічив це за
  // блокування пререндера (blocking-prerender-current-time).
  await connection();
  const employee = await getCurrentUser();
  if (!employee) redirect("/register");
  // Керівний шар (SV і вище) не бачить /hub взагалі — app/hub/layout.js
  // перекидає будь-який запит туди на /manager (isManagerTier). Кнопка
  // "назад" у плеєрі/методичці мала на увазі саме це й раніше вела на
  // /hub/learn для всіх — для керівника це закінчувалось на загальному
  // дашборді команди, а не на списку курсів (скарга користувача,
  // 2026-09-18). /manager/courses — той самий особистий список курсів,
  // лише в кабінеті керівника.
  const backHref = isManagerTier(employee) ? "/manager/courses" : "/hub/learn";

  const course = await getCourseForPlayer(slug);
  if (!course) notFound();

  const enrollment = await getEnrollmentForCourse(employee.id, course.id);
  if (!enrollment) {
    // Досяжно, напр., зі старого сповіщення (курс, з якого людину вже
    // зняли, лист лишився в центрі сповіщень) — раніше цей фолбек не мав
    // ЖОДНОЇ навігації, просто текст на порожньому екрані без виходу
    // (реальна скарга користувача, 2026-09-22). Той самий appbar/кнопка
    // "На головну", що й у CourseReview.jsx/CoursePlayer.jsx.
    return (
      <div className="stage stage--course-player">
        <div className="course-col">
          <div className="course-card">
            <div className="appbar">
              <Link className="iconbtn" aria-label="Закрити" href={backHref}>
                <XIcon />
              </Link>
            </div>
            <div className="cp-viewport">
              <div className="cp-screen">
                <h2 className="cp-h2">Курс ще не призначено</h2>
                <p className="cp-lead">
                  Цей курс вам поки не призначено. Зверніться до вашого керівника або адміністратора.
                </p>
                <Link className="btn btn-primary cp-complete-secondary" href="/hub">
                  На головну
                </Link>
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

  // "Пауза перед повторним проходженням" (Module.retakeCooldownDays):
  // модулі, які вже складено (passed) і пауза перепроходження ще не
  // минула, сюди НЕ потрапляють — плеєр більше не змушує переграти вже
  // складене з нуля щоразу, як людина заходить у курс (реальна скарга
  // користувача: "кнопка знову відкриває пройдений модуль").
  const { playable: sessionModules, nextLocked } = getSessionModules(course, completionsByModuleId);

  // План курсу — рахується ЗАВЖДИ: він потрібен і плеєру (перший екран), і
  // методичці (щоб із неї можна було перепройти модуль, складений не на
  // 100%). Дати форматуються тут, на сервері: той самий toLocaleDateString
  // на клієнті в іншій таймзоні дав би інший текст і розбіжність гідратації.
  const plan = buildCoursePlan(
    course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      order: m.order,
      cooldownDays: m.cooldownDays,
      retakeCooldownDays: m.retakeCooldownDays,
      componentCount: componentCount(m),
      retryFreeAttempts: m.retryFreeAttempts,
      retryCooldownHours: m.retryCooldownHours,
    })),
    completions,
    { assignedAt: enrollment.assignedAt, dueDate: enrollment.dueDate },
    new Date(),
    // Темп і правила перескладання з конструктора: рекомендовано днів на
    // модуль, загальна пауза між модулями і «м'яке гальмо» повторних
    // спроб (власні поля модуля мають пріоритет над курсом).
    {
      moduleDays: course.moduleDays ?? null,
      pauseDays: course.modulePauseDays ?? null,
      retryFreeAttempts: course.retryFreeAttempts ?? null,
      retryCooldownHours: course.retryCooldownHours ?? null,
    }
  );
  const planView = toPlanView(plan, course.certificateEnabled !== false);

  // Обраний модуль грається сам по собі — але лише якщо план справді
  // дозволяє його зараз проходити. Інакше ?module= у рядку адреси став би
  // способом обійти і паузу між модулями, і паузу перепроходження.
  const requestedPlanModule = requestedModuleId
    ? plan.modules.find((m) => m.id === requestedModuleId && m.canPlay)
    : null;
  const singleModule = requestedPlanModule
    ? course.modules.find((m) => m.id === requestedPlanModule.id)
    : null;
  const playableModules = singleModule ? [singleModule] : sessionModules;

  // Курс складено на 100% і кожен модуль має запис про складання —
  // перепроходити нічого (фінальний екран при 100% і кнопки «Пройти ще
  // раз» не має), тож завжди методичка. Без цієї гілки співробітники, у
  // чиїх курсах немає паузи перепроходження (retakeCooldownDays), після
  // 100% знову потрапляли в плеєр з гейтами замість довідника (скарга
  // користувача 2026-09-14: «у ТП/мерчендайзерів методичка з гейтами»).
  // Умова «кожен модуль складено» — щоб курс, до якого ДОДАЛИ модуль після
  // проходження, не лишився назавжди в методичці зі старими 100%.
  const perfectAndComplete =
    enrollment.status === "completed" &&
    enrollment.scorePercent === 100 &&
    course.modules.every((m) => completionsByModuleId.has(m.id));

  // Повідомлення про наступний недоступний модуль (якщо є) — у порядку
  // проходження. Стосується лише прогресивного гейта (ще не складено
  // попередній) — модулі, пропущені через паузу ПЕРЕПРОХОДЖЕННЯ, просто
  // тихо пропускаються (вони вже складені, пояснювати нічого не треба).
  let lockedNotice = null;
  if (nextLocked) {
    const { module: nl, reason, unlocksAt } = nextLocked;
    lockedNotice =
      reason === "cooldown"
        ? `Модуль «${nl.title}» відкриється ${unlocksAt.toLocaleDateString("uk-UA")}.`
        : reason === "pause"
          ? `Модуль «${nl.title}» відкриється через ${moduleCooldownDays(course, nl)} дн. після складання попереднього.`
          : `Модуль «${nl.title}» відкриється після того, як ви складете попередній модуль.`;
  }

  // Немає жодного модуля, який зараз варто (пере)проходити, але щось уже
  // реально складено. Два РІЗНІ випадки, які до 2026-09-22 виглядали
  // однаково (обидва відкривали методичку — скарга користувача):
  //
  // 1. Курс справді закінчено на 100% (perfectAndComplete) — покращувати
  //    нічого, лишається читальний режим: методичка з усім матеріалом.
  // 2. Курс ЩЕ НЕ закінчено: попереду або нескладений модуль під паузою
  //    (Механіка 10: «Модуль 10 відкриється 23.09»), або складений нижче
  //    100% модуль, який можна буде перепройти пізніше (Механіка 5:
  //    модуль на 50%, перепроходження з 24.09). Тут методичка приховує
  //    саме те, що людині потрібно — ПЛАН: що лишилось і коли
  //    повертатись. Тож показуємо план курсу, без матеріалу й без
  //    якірної рейки по модулях (planOnly).
  if (perfectAndComplete || (playableModules.length === 0 && completions.length > 0)) {
    return (
      <CourseReview
        course={course}
        backHref={backHref}
        lockedNotice={lockedNotice}
        planOnly={!perfectAndComplete}
        // Поки курс не пройдено до кінця, для повторення відкриті лише
        // СКЛАДЕНІ модулі: інакше після першого модуля людина читала б
        // матеріал усіх наступних ще до того, як пауза їх відкрила, — і
        // пауза між модулями втрачала б сенс.
        modules={
          plan.remainingCount > 0
            ? course.modules.filter((m) => completionsByModuleId.get(m.id)?.passed)
            : course.modules
        }
        scorePercent={enrollment.scorePercent}
        // Для СКЛАДЕНОГО на 100% курсу план не показується (2026-09-18:
        // прибрано разом із сертифікатом — обидва вже є на картці курсу).
        // У режимі planOnly план — це весь екран.
        plan={planView}
      />
    );
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
      // passed — РЕАЛЬНЕ збережене значення з ModuleCompletion (пройдений
      // поріг на момент складання ЦЬОГО модуля), не перерахунок за
      // поточним course.passThreshold: якщо поріг курсу змінили пізніше,
      // уже складені модулі не повинні заднім числом "перескладатись".
      if (completion.scoreRaw != null && completion.scoreMax != null) {
        return { scoreRaw: completion.scoreRaw, scoreMax: completion.scoreMax, passed: completion.passed };
      }
      // Легасі-рядок, записаний до появи scoreRaw/scoreMax на
      // ModuleCompletion, — best-effort реконструкція з реальної к-сті
      // питань модуля й округленого scorePercent (трохи менш точно за
      // оригінал, але краще, ніж узагалі загубити внесок цього модуля).
      const quizCount = m.screens.reduce((sum, s) => sum + s.components.filter((c) => c.type === "quiz").length, 0);
      return {
        scoreRaw: Math.round((completion.scorePercent / 100) * quizCount),
        scoreMax: quizCount,
        passed: completion.passed,
      };
    })
    .filter(Boolean);

  // Пул питань (Module.questionPoolSize): за одну спробу показуємо лише
  // частину питань модуля, випадкову. Саме це ламає перебір варіантів при
  // перескладанні — з другого разу питання інші, а знання те саме.
  // Вибірка ТУТ, на сервері: інакше повний список питань приїхав би в
  // браузер і його можна було б прочитати в коді сторінки.
  const modulesWithPool = playableModules.map((m) => {
    // isScored приймає КОМПОНЕНТ, не рядок типу — інакше список питань
    // виходив порожнім і пул мовчки не застосовувався.
    const quizIds = m.screens.flatMap((s) => s.components.filter(isScored).map((c) => c.id));
    const keep = pickQuestionPool(quizIds, m.questionPoolSize);
    if (keep.size === quizIds.length) return m;
    const screens = m.screens
      .map((s) => ({ ...s, components: s.components.filter((c) => !isScored(c) || keep.has(c.id)) }))
      // Екран, з якого прибрали єдине питання, показувати нічого — тихо
      // прибираємо, інакше людина побачила б порожній крок.
      .filter((s) => s.components.length > 0);
    return { ...m, screens };
  });

  const courseWithPlayableContent = { ...course, modules: modulesWithPool };

  const screens = flattenScreens(courseWithPlayableContent).map((screen) => ({
    id: screen.id,
    title: screen.title,
    moduleId: screen.moduleId,
    moduleTitle: screen.moduleTitle,
    components: screen.components,
  }));

  // Сесія не доходить до кінця курсу (попереду модуль під паузою) —
  // плеєр після останнього модуля сесії показує чекпоінт і НЕ відправляє
  // /submit (курс ще не пройдено). pauseDays/moduleTitle — щоб чекпоінт
  // назвав ДАТУ відкриття: сервер її не знає (пауза рахується від
  // складання, яке станеться лише в плеєрі), а «через 3 дн.» без дати
  // людина мусила рахувати сама.
  //
  // Окремо обраний модуль: курс завершується лише тоді, коли після нього
  // запис про складання буде в КОЖНОГО модуля курсу. Саме це дає
  // перерахунок балу при перепроходженні — /submit складає новий бал
  // цього модуля з уже збереженими балами решти (skippedModuleScores), і
  // останній результат перекриває попередній (рішення користувача,
  // 2026-09-17). Якщо ж попереду ще є нескладені модулі, /submit не
  // відправляється: курс не можна «закрити» одним обраним модулем.
  let afterSession = nextLocked
    ? {
        moreModules: true,
        notice: lockedNotice,
        moduleTitle: nextLocked.module.title,
        pauseDays: nextLocked.reason === "pause" ? moduleCooldownDays(course, nextLocked.module) : null,
      }
    : null;
  if (singleModule) {
    const completesCourse = course.modules.every(
      (m) => completionsByModuleId.has(m.id) || m.id === singleModule.id
    );
    afterSession = completesCourse
      ? null
      : { moreModules: true, notice: "Модуль зараховано. Решта курсу чекає у плані." };
  }

  return (
    <CoursePlayer
      // key — щоб перехід із плану на ?module=N ПЕРЕМОНТУВАВ плеєр. Без
      // нього Next робить клієнтську навігацію в той самий маршрут, і
      // компонент лишається зі старим станом: idx на вступі, answers і
      // gateProgress від попередньої сесії, ефект відновлення з
      // localStorage уже відпрацював. Людина натискала «Почати» на модулі
      // й бачила той самий вступний екран (скарга користувача, 2026-09-17).
      key={singleModule ? `module-${singleModule.id}` : "session"}
      backHref={backHref}
      course={{
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        streakMessages: course.streakMessages,
        certificateEnabled: course.certificateEnabled,
        // Без цього поля плеєр падав на `?? 80` і будь-який курс з іншим
        // порогом (стенд «Механіка 5», поріг 50: модуль на 1/2 = 50% →
        // «не складено») поводився як 80% — а сервер (module-complete)
        // просто вірить присланому passed (знайдено стендом механіки,
        // 2026-09-22).
        passThreshold: course.passThreshold,
      }}
      screens={screens}
      enrollmentId={enrollment.id}
      // Для співробітників без email Employee.name — заглушка з посади;
      // справжнє ім'я лежить лише в localStorage пристрою й передається
      // разово в запит на сертифікат (lib/downloadCertificate.js).
      hasEmail={Boolean(employee.email)}
      lockedNotice={lockedNotice}
      afterSession={afterSession}
      skippedModuleScores={skippedModuleScores}
      plan={planView}
      // Людина сама обрала цей модуль у плані — плеєр каже про це прямо,
      // щоб не здавалося, ніби курс «скоротився».
      singleModuleTitle={singleModule ? singleModule.title : null}
    />
  );
}
