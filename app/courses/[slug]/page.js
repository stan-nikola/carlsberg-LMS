import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { getCurrentUser, getSessionClaims } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getCourseForPlayer,
  flattenScreens,
  getSessionModules,
  moduleCooldownDays,
} from "@/lib/courseContent";
import { buildCoursePlan, toPlanView, toPlanInputs, toPacing } from "@/lib/coursePlan";
import { isScored } from "@/lib/componentTypes";
import { attemptNumbersFrom, modulePool, openAttemptAnswersFrom, toPlayerComponent } from "@/lib/moduleAttempts";
import { formatUkraineDate } from "@/lib/ukraineTime";
import { isManagerTier } from "@/lib/permissions";
import { CoursePlayer } from "@/components/course/player/CoursePlayer";
import { CourseReview } from "@/components/course/CourseReview";
import { XIcon } from "@/components/ui/icons";

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
  // (components/course/CoursePlan.tsx); без нього плеєр бере поточну сесію.
  const requestedModuleId = Number((await searchParams)?.module) || null;
  // Сторінка рахує доступність модулів від «зараз» (new Date() у
  // getSessionModules/buildCoursePlan) — це запит-час, а не пререндер;
  // без явного connection() валідатор Cache Components лічив це за
  // блокування пререндера (blocking-prerender-current-time).
  await connection();
  // Усе, що залежить лише від людини й курсу, — одним паралельним кроком,
  // а не ланцюжком із ~11 послідовних звернень до бази.
  // Людина береться з підпису cookie; сама сесія (активність, відкликання)
  // перевіряється getCurrentUser у тому ж кроці, і без неї нічого з
  // прочитаного не показується — redirect нижче.
  const claims = await getSessionClaims();
  if (!claims) redirect("/register");
  const mine = { employeeId: claims.employeeId, course: { slug } };
  const [employee, course, enrollment, completions, openAttempts, openAnswerRows] = await Promise.all([
    getCurrentUser(),
    getCourseForPlayer(slug),
    prisma.enrollment.findFirst({ where: mine }),
    prisma.moduleCompletion.findMany({ where: { enrollment: mine } }),
    prisma.moduleAttempt.findMany({ where: { enrollment: mine, finishedAt: null }, select: { moduleId: true, attemptNumber: true } }),
    prisma.attemptAnswer.findMany({
      where: { attempt: { enrollment: mine, finishedAt: null } },
      select: { componentId: true, correct: true, response: true },
    }),
  ]);
  if (!employee) redirect("/register");
  // Керівний шар (SV і вище) не бачить /hub взагалі — app/hub/layout.js
  // перекидає будь-який запит туди на /manager (isManagerTier). Кнопка
  // "назад" у плеєрі/методичці мала на увазі саме це й раніше вела на
  // /hub/learn для всіх — для керівника це закінчувалось на загальному
  // дашборді команди, а не на списку курсів (скарга користувача,
  // 2026-09-18). /manager/courses — той самий особистий список курсів,
  // лише в кабінеті керівника.
  const backHref = isManagerTier(employee) ? "/manager/courses" : "/hub/learn";

  if (!course) notFound();

  if (!enrollment) {
    // Досяжно, напр., зі старого сповіщення (курс, з якого людину вже
    // зняли). Той самий appbar/кнопка "На головну", що й у
    // CourseReview.jsx/CoursePlayer.tsx — інакше екран без виходу.
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
                <Link className="btn btn-primary cp-complete-secondary" href="/">
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
  // Темп і правила перескладання з конструктора (toPacing): рекомендовано
  // днів на модуль, загальна пауза між модулями і «м'яке гальмо» повторних
  // спроб (власні поля модуля мають пріоритет над курсом).
  const plan = buildCoursePlan(
    toPlanInputs(course.modules, componentCount),
    completions,
    { assignedAt: enrollment.assignedAt, dueDate: enrollment.dueDate },
    new Date(),
    toPacing(course)
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
        ? `Модуль «${nl.title}» відкриється ${formatUkraineDate(unlocksAt)}.`
        : reason === "pause"
          ? `Модуль «${nl.title}» відкриється через ${moduleCooldownDays(course, nl)} дн. після складання попереднього.`
          : `Модуль «${nl.title}» відкриється після того, як ви складете попередній модуль.`;
  }

  // Немає жодного модуля, який зараз варто (пере)проходити, але щось уже
  // реально складено. Два РІЗНІ випадки:
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
    // Методичка питань не показує — і не повинна їх отримувати: усе, що
    // передано в клієнтський компонент, їде в браузер, разом із ключами
    // відповідей (аудит безпеки, 2026-09-27).
    const withoutQuestions = (m) => ({
      ...m,
      screens: m.screens.map((s) => ({ ...s, components: s.components.filter((c) => !isScored(c)) })),
    });
    const reviewCourse = { ...course, modules: course.modules.map(withoutQuestions) };
    return (
      <CourseReview
        course={reviewCourse}
        backHref={backHref}
        lockedNotice={lockedNotice}
        planOnly={!perfectAndComplete}
        // Поки курс не пройдено до кінця, для повторення відкриті лише
        // СКЛАДЕНІ модулі: інакше після першого модуля людина читала б
        // матеріал усіх наступних ще до того, як пауза їх відкрила, — і
        // пауза між модулями втрачала б сенс.
        modules={
          plan.remainingCount > 0
            ? reviewCourse.modules.filter((m) => completionsByModuleId.get(m.id)?.passed)
            : reviewCourse.modules
        }
        scorePercent={enrollment.scorePercent}
        // Для СКЛАДЕНОГО на 100% курсу план не показується (2026-09-18:
        // прибрано разом із сертифікатом — обидва вже є на картці курсу).
        // У режимі planOnly план — це весь екран.
        plan={planView}
      />
    );
  }

  // Бал курсу рахує сервер (lib/moduleAttempts.ts finalizeEnrollment) із
  // результатів модулів — плеєру вже не треба знати бали пропущених модулів.

  // Пул питань (Module.questionPoolSize): за одну спробу показуємо лише
  // частину питань модуля. Вибірка ТУТ, на сервері, і детермінована від
  // номера спроби (lib/retryPolicy.ts poolSeed): оновлення сторінки не
  // перетасовує питання, наступна спроба дає інші, а /answer і
  // module-complete перевіряють рівно цей самий набір.
  const attemptNumbers = attemptNumbersFrom(openAttempts, completions);
  const modulesWithPool = playableModules.map((m) => {
    const keep = modulePool(m, enrollment.id, attemptNumbers.get(m.id) ?? 1);
    const screens = m.screens
      .map((s) => ({
        ...s,
        // Оцінювані компоненти — без ключів відповідей (lib/grading.ts
        // publicContent): правильність і розбір приходять із сервера
        // (POST /api/courses/:slug/answer) лише після відповіді.
        components: s.components
          .filter((c) => !isScored(c) || keep.has(c.id))
          .map((c) => toPlayerComponent(c, enrollment.id)),
      }))
      // Екран, з якого прибрали єдине питання, показувати нічого — тихо
      // прибираємо, інакше людина побачила б порожній крок.
      .filter((s) => s.components.length > 0);
    return { ...m, screens };
  });
  // Відповіді, уже дані в незавершених спробах (перевірені сервером) —
  // плеєр показує їх після перезавантаження, а не порожні питання, на які
  // сервер однаково не прийме іншої відповіді.
  const componentById = new Map(course.modules.flatMap((m) => m.screens.flatMap((s) => s.components.map((c) => [c.id, c]))));
  const initialAnswers = openAttemptAnswersFrom(openAnswerRows, componentById, enrollment.id);

  const courseWithPlayableContent = { ...course, modules: modulesWithPool };

  const screens = flattenScreens(courseWithPlayableContent).map((screen) => ({
    id: screen.id,
    title: screen.title,
    moduleId: screen.moduleId,
    moduleTitle: screen.moduleTitle,
    components: screen.components,
  }));

  // Сесія не доходить до кінця курсу (попереду модуль під паузою) —
  // плеєр після останнього модуля сесії показує чекпоінт, а не фінальний
  // екран курсу. pauseDays/moduleTitle — щоб чекпоінт назвав ДАТУ
  // відкриття: вона рахується від складання, яке станеться лише в плеєрі,
  // а «через 3 дн.» без дати людина мусила рахувати сама.
  //
  // Окремо обраний модуль: курс завершується лише тоді, коли після нього
  // результат буде в КОЖНОГО модуля курсу. Закриває курс сервер
  // (module-complete → finalizeEnrollment) із найкращих результатів
  // модулів; якщо попереду ще нескладені модулі, фінального екрана нема.
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
        // Поріг складання рахує сервер (module-complete); у плеєрі він
        // потрібен лише прев'ю конструктора, де все рахується локально.
        passThreshold: course.passThreshold,
      }}
      screens={screens}
      enrollmentId={enrollment.id}
      // Для співробітників без email Employee.name — заглушка з посади;
      // справжнє ім'я лежить лише в localStorage пристрою й передається
      // разово в запит на сертифікат (lib/downloadCertificate.js).
      lockedNotice={lockedNotice}
      afterSession={afterSession}
      initialAnswers={initialAnswers}
      plan={planView}
      // Людина сама обрала цей модуль у плані — плеєр каже про це прямо,
      // щоб не здавалося, ніби курс «скоротився».
      singleModuleTitle={singleModule ? singleModule.title : null}
      // Окремий слот прогресу для одиночного модуля (?module=N), щоб
      // відновлення не плуталось із прогресом повної сесії (той самий slug).
      singleModuleId={singleModule ? singleModule.id : null}
    />
  );
}
