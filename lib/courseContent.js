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

// "Пауза перед повторним проходженням" — дефолт, коли Module.retakeCooldownDays
// не задано в /admin (null). За проханням користувача — 2 дні всюди, поки
// не налаштовано інакше.
export const RETAKE_COOLDOWN_DAYS_DEFAULT = 2;

/**
 * Чи можна зараз ПЕРЕПРОЙТИ модуль (реальний тест із питаннями заново), а
 * не просто відкрити його вперше. Провалений модуль (passed=false)
 * перепроходиться одразу, без паузи, — так само, як і зараз працює
 * "Спробувати модуль ще раз" на ModuleCheckpointScreen; пауза стосується
 * лише вже СКЛАДЕНОГО модуля (щоб не можна було "накрутити" 100% одразу
 * повторним проходженням).
 */
function isRetakeEligible(completion, retakeCooldownDays, now) {
  if (!completion) return true; // ще не проходив узагалі — це не "повторне"
  if (!completion.passed) return true;
  const cooldown = retakeCooldownDays ?? RETAKE_COOLDOWN_DAYS_DEFAULT;
  if (!cooldown) return true;
  return addDays(completion.completedAt, cooldown) <= now;
}

/**
 * Модулі, які зараз варто ВКЛЮЧИТИ в інтерактивний плеєр (Далі/Назад +
 * тести): доступні по прогресії (computeModuleAvailability) І (ще не
 * пройдені, або провалені, або складені, але пауза перепроходження вже
 * минула). Раніше плеєр завжди прогонав ВСІ доступні модулі заново від
 * початку курсу — навіть ті, що вже давно складено на відмінно, — це і
 * була причина "кнопка знову відкриває пройдений модуль" (реальна скарга
 * користувача). Якщо результат порожній, а щось у курсі вже пройдено —
 * показувати не плеєр, а курс-методичку (components/CourseReview.jsx).
 *
 * @param {{ modules: { id: number, cooldownDays: number|null, retakeCooldownDays: number|null }[] }} course
 * @param {Map<number, { passed: boolean, completedAt: Date }>} completionsByModuleId
 */
export function getPlayableModules(course, completionsByModuleId, now = new Date()) {
  const availability = computeModuleAvailability(course, completionsByModuleId);
  return course.modules.filter((courseModule) => {
    const avail = availability.get(courseModule.id);
    if (!avail.available) return false;
    const completion = completionsByModuleId.get(courseModule.id);
    return isRetakeEligible(completion, courseModule.retakeCooldownDays, now);
  });
}

// Орієнтовний час на один компонент екрана (читання інфо-блоку, відповідь
// на питання, розгортання картки в акордеоні тощо) — усереднено, без
// розрізнення типів компонентів: реальна різниця (5с на просте фото проти
// 40с на розгорнутий текст) вимагала б або ручного поля в /admin на
// КОЖЕН компонент (велике навантаження на автора курсу заради дуже
// приблизної цифри), або аналізу довжини тексту (крихке — залежить від
// швидкості читання конкретної людини не менше, ніж від довжини). 45с —
// компромісне середнє, що дає орієнтир, не точний хронометраж.
const SECONDS_PER_COMPONENT = 45;

/**
 * Орієнтовний час проходження МОДУЛЯ, автоматично з реальної кількості
 * компонентів у ньому (не ручне поле в /admin — рахується сам, завжди
 * актуальний, навіть якщо контент модуля пізніше зміниться; порахований
 * один раз при кожному запиті, не зберігається окремим полем, щоб не
 * могло розсинхронитись зі справжнім вмістом).
 *
 * @param {{ screens: { _count: { components: number } }[] }} courseModule
 */
export function estimateModuleMinutes(courseModule) {
  const componentCount = courseModule.screens.reduce((sum, screen) => sum + screen._count.components, 0);
  return Math.max(1, Math.round((componentCount * SECONDS_PER_COMPONENT) / 60));
}

/**
 * Список модулів курсу зі статусом для попереднього перегляду (CourseTile —
 * акордеон "курс містить модулі", НЕ сам плеєр): та сама
 * computeModuleAvailability, що й у app/courses/[slug]/page.js, доповнена
 * фактом складання (ModuleCompletion) для кожного модуля. Курс сам по собі
 * не залікова одиниця (Enrollment рахується по курсу в цілому) — тут лише
 * показуємо, з чого він складається і що з цього вже пройдено.
 *
 * @param {{ modules: { id: number, title: string, order: number, cooldownDays: number|null }[] }} course
 * @param {{ moduleId: number, passed: boolean, scorePercent: number, completedAt: Date }[]} moduleCompletions
 */
export function getModuleStatusList(course, moduleCompletions) {
  const completionsByModuleId = new Map(moduleCompletions.map((c) => [c.moduleId, c]));
  const availability = computeModuleAvailability(course, completionsByModuleId);

  return course.modules.map((courseModule) => {
    const completion = completionsByModuleId.get(courseModule.id);
    const avail = availability.get(courseModule.id);
    // "failed" — модуль пройдено (складено тести), але не набрано прохідний
    // бал; наступний модуль лишається заблокованим (computeModuleAvailability
    // враховує passed), а сам цей — повторюється в межах того самого
    // безперервного проходження курсу (ModuleCheckpointScreen), не окремим
    // входом сюди.
    const status = completion ? (completion.passed ? "completed" : "failed") : avail.available ? "available" : "locked";
    return {
      id: courseModule.id,
      title: courseModule.title,
      order: courseModule.order,
      status,
      scorePercent: completion ? completion.scorePercent : null,
      longestCorrectStreak: completion ? completion.longestCorrectStreak : null,
      estimatedMinutes: estimateModuleMinutes(courseModule),
    };
  });
}
