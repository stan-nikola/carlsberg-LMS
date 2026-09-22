import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getModuleStatusList } from "@/lib/courseContent";
import { groupLearning, pickContinueEnrollments, sortByUrgency } from "@/lib/progress";
import { mandatoryProgress } from "@/lib/ratingLogic";
import { getTimeBasedGreeting } from "@/lib/greeting";

/**
 * Все назначения (Enrollment) сотрудника вместе с курсом — единственный
 * источник правды для хаба теперь БД, а не localStorage, як в legacy.
 *
 * "use cache: private" (не unstable_cache — той не рахується межею кешу
 * для Cache Components-валідатора "instant navigation": дев-лог
 * продовжував кричати blocking-prerender-dynamic саме на цьому виклику,
 * доки не перейшли на директиву; офіційний migration guide прямо каже
 * "unstable_cache is replaced by use cache").
 *
 * Саме "private", а не звичайний "use cache": на Vercel (serverless,
 * багато інстансів) in-memory кеш звичайного "use cache" живе лише в
 * одному інстансі — повторний клієнтський перехід міг влучити в ІНШИЙ,
 * порожній інстанс, і на реальному проді (на відміну від локального
 * `next start`, де процес один) запит однаково йшов на сервер ~2с.
 * "use cache: remote" тут не підходить — ключ кешу (employeeId) майже
 * унікальний на кожного співробітника, спільного кешу між користувачами
 * не буде (офіційна документація прямо застерігає від remote-кешу для
 * "user-specific parameters" — утилізація кешу близька до нуля).
 * "private" кешує результат у пам'яті БРАУЗЕРА конкретного користувача —
 * не залежить від того, який інстанс Vercel обробить запит.
 * Ключ кешу — самі аргументи (employeeId), окремого масиву-префіксу не
 * треба.
 */
export async function getEmployeeEnrollments(employeeId) {
  "use cache: private";
  cacheLife("minutes"); // stale 5хв (мін. поріг для App Shell) — той самий орієнтир, що й старий revalidate:60
  cacheTag("enrollments");

  const enrollments = await prisma.enrollment.findMany({
    where: { employeeId },
    include: {
      course: {
        include: {
          // _count.modules — щоб CourseTile міг показати "N модулів": курс
          // складається з модулів (Course -> Module -> Screen -> Component),
          // а на плоскому списку карток курсів це раніше ніяк не було видно
          // — кілька курсів з однаковим префіксом назви ("Технік розливного
          // обладнання: ...") виглядали як незалежні один від одного
          // пункти, хоча кожен сам по собі — повноцінний курс із власними
          // модулями.
          _count: { select: { modules: true } },
          // Повний список модулів — для акордеону CourseTile (клік по
          // курсу розгортає саме ЙОГО модулі, замість того, щоб усі модулі
          // всіх курсів виглядали одним суцільним рядом карток). screens з
          // лише к-стю компонентів (не весь контент) — щоб порахувати
          // orientировний час проходження (lib/courseContent.js
          // estimateModuleMinutes), не тягнучи важкий вміст модуля заради
          // самого лише числа.
          modules: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              order: true,
              cooldownDays: true,
              // Пауза перепроходження — картка курсу рахує з неї, чи можна
              // зараз «Покращити результат» (getModuleStatusList). Без
              // цього поля воно мовчки падало б на дефолтні 2 дні й
              // ігнорувало налаштоване в конструкторі значення модуля.
              retakeCooldownDays: true,
              retryFreeAttempts: true,
              retryCooldownHours: true,
              screens: { select: { _count: { select: { components: true } } } },
            },
          },
        },
      },
      moduleCompletions: true,
    },
    orderBy: { assignedAt: "asc" },
  });

  return enrollments.map((enrollment) => ({
    ...enrollment,
    course: { ...enrollment.course, modules: getModuleStatusList(enrollment.course, enrollment.moduleCompletions) },
  }));
}

/**
 * Готові дані екранів хаба, порахованi ВСЕРЕДИНІ кеш-межі (2026-09-22).
 * mandatoryProgress / groupLearning / getTimeBasedGreeting беруть
 * `now = new Date()` за замовчуванням — а `new Date()` у тілі page.js
 * (поза кешем) — це некешоване динамічне читання, на якому App Shell
 * (partialPrefetching) зупиняється, і вкладка щоразу йде на сервер. Доки
 * getCurrentUser робив `connection()`, сторінка й так була динамічною і
 * це не було видно; щойно сесію закешували — валідатор Cache Components
 * назвав саме ці виклики (blocking-prerender-current-time). Усередині
 * "use cache: private" `new Date()` дозволений — момент фіксується разом
 * із записом кешу; stale 5хв для дедлайнів із денною точністю і для
 * "Доброго ранку/дня" — прийнятно. Тег той самий, що в enrollments:
 * складання модуля скидає й це.
 */
export async function getHubHomeData(employeeId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("enrollments");
  const enrollments = await getEmployeeEnrollments(employeeId);
  return {
    enrollments,
    mandatory: mandatoryProgress(enrollments),
    continueEnrollments: pickContinueEnrollments(enrollments, 3),
    greet: getTimeBasedGreeting(),
  };
}

export async function getHubLearnData(employeeId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("enrollments");
  const enrollments = await getEmployeeEnrollments(employeeId);
  return { enrollments, groups: groupLearning(enrollments) };
}

/** /manager/courses: те саме для sortByUrgency (теж `now = new Date()`). */
export async function getManagerCoursesData(employeeId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("enrollments");
  return sortByUrgency(await getEmployeeEnrollments(employeeId));
}

// Той самий привід, що вже приймав lib/rating.ts/lib/achievements.ts цього
// аудиту: глибоко вкладений findMany (курс → модулі → екрани → лічильник
// компонентів) — саме він тримав /manager/courses і /hub на ~2с навіть
// після переходу на Cache Components (той прискорює лише статичну
// "оболонку" екрана, не сам вміст — цей запит навмисно лишається
// динамічним, бо персональний). cacheLife("minutes") — узгоджено з
// rating/badges, але тут додатково invalidateEmployeeEnrollments() у самих
// точках зміни (module-complete, submit): прогрес курсу людина перевіряє
// одразу після власної дії, хвилинна затримка на власному "щойно склав"
// помітніша, ніж на балах рейтингу. { expire: 0 } — а не рекомендований
// профіль "max" — бо це Route Handler, не Server Action: updateTag() (яка
// саме й дає read-your-own-writes) там кидає помилку, а без { expire: 0 }
// revalidateTag лише позначає тег застарілим і однаково віддає старий
// результат, доки не спливе фонове оновлення.
export function invalidateEmployeeEnrollments() {
  revalidateTag("enrollments", { expire: 0 });
}
