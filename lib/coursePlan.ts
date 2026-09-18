/**
 * План курсу для співробітника — те, що людина бачить, коли відкриває курс
 * у плеєрі: з якого модуля піде навчання, що вже складено, коли
 * відкриється заблокований модуль, скільки це все займе часу і в якому
 * темпі треба йти, щоб встигнути до дедлайну.
 *
 * До цього (2026-09-17) плеєр показував лише лінійний прогрес-бар
 * «екран 3 з 18»: з нього не було видно ні складу курсу, ні того, який
 * модуль зараз почнеться, ні можливості перепройти конкретний модуль
 * (скарга користувача).
 *
 * Чиста функція без prisma й без React — саме тому лежить окремо від
 * lib/courseContent.js (там уже є робота з базою) і покрита тестами:
 * дати й паузи — рівно та логіка, яку найлегше зламати непомітно.
 *
 * Правила доступу повторюють getSessionModules (lib/courseContent.js), і
 * навмисно НЕ дублюють його реалізацію по-своєму:
 *  - перший модуль доступний завжди;
 *  - наступний — коли попередній СКЛАДЕНО (passed) і минула пауза
 *    module.cooldownDays від дати складання попереднього;
 *  - складений модуль можна перепройти після власної паузи
 *    module.retakeCooldownDays (дефолт RETAKE_COOLDOWN_DAYS_DEFAULT).
 */

import { resolveRetryRules, retryGate } from "./retryPolicy";
import { medalTier } from "./progress";

/** Пауза перед повторним проходженням, коли Module.retakeCooldownDays не задано. */
export const RETAKE_COOLDOWN_DAYS_DEFAULT = 2;

/** Скільки секунд закладаємо на один компонент екрана — те саме число, що
 *  й у lib/estimateTime.js; продубльоване значення тут не потрібне, тому
 *  кількість хвилин приходить ззовні готовою. */
export type PlanModuleInput = {
  id: number;
  title: string;
  order: number;
  cooldownDays: number | null;
  retakeCooldownDays: number | null;
  /** Скільки компонентів у модулі — з нього рахується орієнтовний час. */
  componentCount: number;
  /** Перевизначення правил перескладання цим модулем (null — з курсу). */
  retryFreeAttempts?: number | null;
  retryCooldownHours?: number | null;
};

export type PlanCompletion = {
  moduleId: number;
  passed: boolean;
  scorePercent: number;
  completedAt: Date;
  /** Скільки разів модуль уже проходили — для гальма перескладання. */
  attemptCount?: number;
  /** РЕАЛЬНИЙ час останньої спроби (секунди) — null для завершень,
   *  записаних до появи цього поля (2026-09-17); тоді картка плану й
   *  далі показує орієнтовну оцінку, як для непройденого модуля. */
  durationSeconds?: number | null;
};

/**
 * Темп курсу з налаштувань у конструкторі (Course.moduleDays /
 * Course.modulePauseDays). Модель — як у Coursera: рекомендовані дати по
 * модулях М'ЯКІ (орієнтир, без штрафу), жорсткий лише один дедлайн курсу
 * (Enrollment.dueDate); а відкриття наступного модуля — від ФАКТУ
 * складання попереднього плюс мінімальна пауза, а не від календаря
 * (Thinkific/LearnDash відкривають за днями від запису — у нас свідомо
 * інакше, щоб не можна було «перескочити» непройдений модуль).
 */
export type CoursePacing = {
  /** Рекомендовано днів на один модуль; null — графіка немає. */
  moduleDays: number | null;
  /** Мінімальна пауза перед наступним модулем — дефолт для модулів, у
   *  яких власний cooldownDays не задано. */
  pauseDays: number | null;
  /** Правила перескладання на рівні курсу (lib/retryPolicy.ts) — дефолт
   *  для модулів без власних. */
  retryFreeAttempts?: number | null;
  retryCooldownHours?: number | null;
};

export type PlanModuleStatus = "passed" | "failed" | "available" | "locked";

export type PlanModule = {
  id: number;
  title: string;
  order: number;
  status: PlanModuleStatus;
  scorePercent: number | null;
  completedAt: Date | null;
  estimatedMinutes: number;
  /** Реально витрачені хвилини на ОСТАННЮ спробу — null, якщо ще не
   *  проходив або спробу записано до появи лічильника (2026-09-17). */
  actualMinutes: number | null;
  /** Модуль, з якого почнеться навчання, якщо натиснути головну кнопку. */
  isNext: boolean;
  /** Точна дата відкриття — лише коли вона ВІДОМА (попередній складено, іде
   *  пауза). Для модулів далі по курсу дата залежить від того, коли людина
   *  складе попередній, і вигадувати її не можна. */
  unlocksAt: Date | null;
  /** Скільки днів паузи після складання попереднього — для модулів, чию
   *  дату ще не можна знати: «через 3 дні після складання попереднього». */
  unlockAfterDays: number | null;
  /** Заблокований, бо попередній ще не складено (а не через паузу). */
  waitingForPrevious: boolean;
  /** Можна зайти й проходити прямо зараз. */
  canPlay: boolean;
  /** Складений модуль, який дозволено перепройти зараз. */
  canRetake: boolean;
  /** Складений модуль під паузою перепроходження: коли її буде знято. */
  retakeAvailableAt: Date | null;
  /** ПРОВАЛЕНИЙ модуль під гальмом перескладання: коли відкриється
   *  наступна спроба (години, тому окремо від retakeAvailableAt — там дні). */
  retryBlockedUntil: Date | null;
  /** Рекомендована дата, до якої варто скласти цей модуль (від дати
   *  призначення, крок Course.moduleDays). М'який орієнтир, не дедлайн. */
  targetDate: Date | null;
  /** Рекомендована дата вже минула, а модуль ще не складено. */
  behindTarget: boolean;
};

export type ScheduleStatus = "on_track" | "behind" | "ahead";

export type CourseSchedule = {
  status: ScheduleStatus;
  /** На скільки модулів людина відстає від рекомендованого графіка
   *  (0 — за графіком; від'ємне — випереджає). */
  behindBy: number;
  moduleDays: number;
};

export type CoursePace = {
  /** Днів до дедлайну; від'ємне — прострочено. */
  daysLeft: number;
  /** Скільки модулів треба складати на тиждень, щоб встигнути. */
  modulesPerWeek: number;
  /** Дедлайн уже минув. */
  overdue: boolean;
  /** Паузи між модулями фізично не дають скласти решту до дедлайну. */
  blockedByCooldowns: boolean;
};

export type CoursePlan = {
  modules: PlanModule[];
  totalMinutes: number;
  /** Хвилини лише по тому, що ще лишилось скласти. */
  remainingMinutes: number;
  passedCount: number;
  remainingCount: number;
  assignedAt: Date | null;
  dueDate: Date | null;
  pace: CoursePace | null;
  /** Порівняння з рекомендованим графіком, якщо він заданий. */
  schedule: CourseSchedule | null;
  /** id модуля, з якого почнеться навчання, або null — усе складено. */
  nextModuleId: number | null;
};

/**
 * Те саме, але вже готове до показу: самі рядки, без Date. Дати
 * форматуються на СЕРВЕРІ й далі не перераховуються — інакше той самий
 * `toLocaleDateString` на клієнті з іншою таймзоною дає інший текст, і
 * React лається на розбіжність гідратації (цей проєкт уже ловив таке на
 * екрані реєстрації). Плюс модель лишається звичайним JSON, тож її можна
 * передати і в клієнтський CoursePlayer, і в серверний CourseReview.
 */
export type PlanModuleView = {
  id: number;
  order: number;
  title: string;
  status: PlanModuleStatus;
  /** "85%" — бал за модуль, якщо він уже проходився. */
  scoreLabel: string | null;
  /** Той самий бал, числом — картці плану потрібне саме число: чи це
   *  рівно 100% (тоді дотягувати нема куди, ціль на картці не показуємо),
   *  і власний, вужчий за lib/progress.js medalTier поріг срібла/бронзи
   *  для кубка на картці (2026-09-18, рішення користувача). */
  scorePercent: number | null;
  /** Медаль за бал модуля — той самий поріг, що й на картці курсу
   *  (lib/progress.js medalTier): 100=золото, 95-99=срібло, 90-94=бронза. */
  medalTier: "gold" | "silver" | "bronze" | null;
  /** "10.09.2026" — коли складено. */
  completedAtLabel: string | null;
  /** "6 хв" — орієнтовний час проходження. */
  timeLabel: string;
  isNext: boolean;
  canPlay: boolean;
  canRetake: boolean;
  /** Чому модуль закритий і коли відкриється. */
  lockLabel: string | null;
  /** Який значок поставити біля lockLabel — точна дата / зворотний
   *  відлік у днях / просто «наступний за порядком» без дати взагалі. */
  lockKind: LockKind | null;
  /** Коли можна буде перепройти вже складений модуль. */
  retakeLabel: string | null;
  /** Підпис кнопки дії або null, якщо діяти зараз не можна. */
  actionLabel: string | null;
  /** "до 24.09.2026" — рекомендована дата складання, якщо графік задано. */
  targetLabel: string | null;
  behindTarget: boolean;
};

export type CoursePlanView = {
  modules: PlanModuleView[];
  totalTimeLabel: string;
  remainingTimeLabel: string;
  passedCount: number;
  moduleCount: number;
  remainingCount: number;
  assignedAtLabel: string | null;
  dueDateLabel: string | null;
  /** Один рядок про темп: скільки модулів на тиждень або чому це вже не грає. */
  paceLabel: string | null;
  /** Порівняння з рекомендованим графіком: «за графіком», «відстаєте на 2 модулі». */
  scheduleLabel: string | null;
  scheduleStatus: ScheduleStatus | null;
  overdue: boolean;
  nextModuleId: number | null;
  /** "Отримано" / "За 100%" / null — сертифікат вимкнено для
   *  курсу (Course.certificateEnabled) або в курсі взагалі немає модулів. */
  certificateLabel: string | null;
  certificateEarned: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SECONDS_PER_COMPONENT = 45;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function estimateMinutes(componentCount: number): number {
  return Math.max(1, Math.round((componentCount * SECONDS_PER_COMPONENT) / 60));
}

/** Календарних днів між двома моментами, округлено вгору: «лишилось 3 дні»
 *  має означати 3, поки не настав сам дедлайн, а не 2 з хвостиком. */
function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function retakeCooldown(courseModule: PlanModuleInput): number {
  return courseModule.retakeCooldownDays ?? RETAKE_COOLDOWN_DAYS_DEFAULT;
}

const NO_PACING: CoursePacing = { moduleDays: null, pauseDays: null };

/** Пауза перед модулем: власна (Module.cooldownDays), інакше загальна для
 *  курсу (Course.modulePauseDays). Перший модуль паузи не має ніколи. */
function effectiveCooldown(m: PlanModuleInput, index: number, pacing: CoursePacing): number {
  if (index === 0) return 0;
  return m.cooldownDays ?? pacing.pauseDays ?? 0;
}

export function buildCoursePlan(
  modules: PlanModuleInput[],
  completions: PlanCompletion[],
  enrollment: { assignedAt: Date | null; dueDate: Date | null },
  now: Date = new Date(),
  pacing: CoursePacing = NO_PACING
): CoursePlan {
  const byModuleId = new Map(completions.map((c) => [c.moduleId, c]));
  const planModules: PlanModule[] = [];

  let nextModuleId: number | null = null;

  for (let i = 0; i < modules.length; i += 1) {
    const m = modules[i];
    const completion = byModuleId.get(m.id) || null;
    const cooldown = effectiveCooldown(m, i, pacing);

    let available: boolean;
    let unlocksAt: Date | null = null;
    let unlockAfterDays: number | null = null;
    let waitingForPrevious = false;

    if (i === 0) {
      available = true;
    } else {
      const prevCompletion = byModuleId.get(modules[i - 1].id);
      if (prevCompletion?.passed) {
        const opensAt = cooldown ? addDays(prevCompletion.completedAt, cooldown) : null;
        available = !opensAt || opensAt <= now;
        // Дату показуємо, лише поки вона в майбутньому — інакше «відкриється
        // 14.09» стояло б на вже доступному модулі.
        if (!available) unlocksAt = opensAt;
      } else {
        available = false;
        waitingForPrevious = true;
        // Попередній ще не складено — реальної дати не існує. Чесно кажемо
        // умову («через N днів після складання попереднього»), а не
        // вигадуємо календарне число.
        unlockAfterDays = cooldown || null;
      }
    }

    // Рекомендована дата: k-й модуль — до assignedAt + k × moduleDays.
    // Саме «до», а не «з»: людині важливо знати, коли модуль має бути
    // складено, а не коли можна починати (починати можна одразу, як
    // відкрився).
    const targetDate =
      enrollment.assignedAt && pacing.moduleDays ? addDays(enrollment.assignedAt, (i + 1) * pacing.moduleDays) : null;
    // Те саме «<=», що й у підрахунку графіка нижче: модуль, чия дата
    // настала сьогодні, вже мав би бути складений.
    const behindTarget = Boolean(targetDate && targetDate <= now && !completion?.passed);

    const status: PlanModuleStatus = completion
      ? completion.passed
        ? "passed"
        : "failed"
      : available
        ? "available"
        : "locked";

    // Перепройти можна те, що складено НЕ на 100%: ідеальний результат
    // покращувати нічим, там лишається методичка (рішення користувача,
    // 2026-09-17). Провалений модуль перепроходиться одразу, без паузи.
    let canRetake = false;
    let retakeAvailableAt: Date | null = null;
    if (available && completion?.passed && completion.scorePercent < 100) {
      const cooldown = retakeCooldown(m);
      const readyAt = cooldown ? addDays(completion.completedAt, cooldown) : null;
      if (!readyAt || readyAt <= now) canRetake = true;
      else retakeAvailableAt = readyAt;
    }

    // Провалений модуль може бути під паузою перескладання («м'яке
    // гальмо», lib/retryPolicy.ts) — тоді план не повинен пропонувати
    // «Скласти ще раз», бо сесія плеєра його однаково не пустить.
    const gate =
      completion && !completion.passed
        ? retryGate(
            { passed: false, completedAt: completion.completedAt, attemptCount: completion.attemptCount ?? 1 },
            resolveRetryRules(
              { retryFreeAttempts: pacing.retryFreeAttempts ?? null, retryCooldownHours: pacing.retryCooldownHours ?? null },
              m
            ),
            now
          )
        : null;
    const retryBlockedUntil = gate && !gate.canRetryNow ? gate.nextAttemptAt : null;

    const notPassedYet = !completion || !completion.passed;
    const canPlay = available && (notPassedYet || canRetake) && !retryBlockedUntil;

    if (nextModuleId === null && available && notPassedYet) nextModuleId = m.id;

    planModules.push({
      id: m.id,
      title: m.title,
      order: m.order,
      status,
      scorePercent: completion ? completion.scorePercent : null,
      completedAt: completion ? completion.completedAt : null,
      estimatedMinutes: estimateMinutes(m.componentCount),
      actualMinutes:
        completion?.durationSeconds != null ? Math.max(1, Math.round(completion.durationSeconds / 60)) : null,
      isNext: false,
      unlocksAt,
      unlockAfterDays,
      waitingForPrevious,
      canPlay,
      canRetake,
      retakeAvailableAt,
      retryBlockedUntil,
      targetDate,
      behindTarget,
    });
  }

  for (const pm of planModules) pm.isNext = pm.id === nextModuleId;

  const passedCount = planModules.filter((m) => m.status === "passed").length;
  const remaining = planModules.filter((m) => m.status !== "passed");
  const totalMinutes = planModules.reduce((sum, m) => sum + m.estimatedMinutes, 0);
  const remainingMinutes = remaining.reduce((sum, m) => sum + m.estimatedMinutes, 0);

  let pace: CoursePace | null = null;
  if (enrollment.dueDate && remaining.length > 0) {
    const daysLeft = daysBetween(now, enrollment.dueDate);
    const overdue = daysLeft <= 0;
    // Тиждень як одиниця планування робочого часу: «2 модулі на тиждень»
    // лягає на робочий графік краще, ніж «0.29 модуля на день».
    const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
    const modulesPerWeek = overdue ? remaining.length : Math.ceil(remaining.length / weeksLeft);
    // Мінімальний реальний строк: паузи між модулями складаються, і жодна
    // старанність їх не обійде. Якщо сума пауз більша за залишок часу —
    // дедлайн недосяжний, і краще сказати це прямо, ніж малювати темп,
    // який нічого не врятує.
    const cooldownDaysAhead = remaining.reduce((sum, m, i) => (i === 0 ? sum : sum + (m.unlockAfterDays ?? 0)), 0);
    pace = {
      daysLeft,
      modulesPerWeek,
      overdue,
      blockedByCooldowns: !overdue && cooldownDaysAhead > daysLeft,
    };
  }

  // Порівняння з графіком: скільки модулів МАЛО б бути складено на
  // сьогодні (їхня рекомендована дата вже минула) проти того, скільки
  // складено насправді. Той самий принцип, що «You're on track / behind»
  // у Coursera — без штрафів, лише орієнтир.
  let schedule: CourseSchedule | null = null;
  if (pacing.moduleDays && enrollment.assignedAt) {
    const expectedDone = planModules.filter((m) => m.targetDate && m.targetDate <= now).length;
    const behindBy = expectedDone - passedCount;
    schedule = {
      status: behindBy > 0 ? "behind" : behindBy < 0 ? "ahead" : "on_track",
      behindBy,
      moduleDays: pacing.moduleDays,
    };
  }

  return {
    modules: planModules,
    totalMinutes,
    remainingMinutes,
    passedCount,
    remainingCount: remaining.length,
    assignedAt: enrollment.assignedAt,
    dueDate: enrollment.dueDate,
    pace,
    schedule,
    nextModuleId,
  };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** 6 -> "6 хв", 75 -> "1 год 15 хв". Той самий формат, що вже в кабінеті
 *  керівника, щоб час скрізь читався однаково. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} год ${rest} хв` : `${hours} год`;
}

/** "день/дні/днів" — без цього виходить «через 3 днів». */
export function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "днів";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дні";
  return "днів";
}

function moduleAction(m: PlanModule): string | null {
  if (!m.canPlay) return null;
  // canRetake — лише для СКЛАДЕНОГО нижче 100% (не для провалу, там своя
  // гілка нижче): підпис саме про покращення вже зарахованого результату,
  // а не про повторну спробу скласти те, що не вийшло (2026-09-18).
  if (m.canRetake) return "Покращити результат";
  if (m.status === "failed") return "Скласти ще раз";
  return m.isNext ? "Почати" : "Відкрити";
}

export type LockKind = "date" | "days" | "sequence";

/**
 * Причина закриття модуля — текст ЛАКОНІЧНІШИЙ, ніж раніше (2026-09-17,
 * скарга користувача на «Відкриється після складання попереднього
 * модуля»): іконка в картці вже каже «закрито», підпис лише додає
 * причину, не повторює її. `kind` — який значок поставити поруч
 * (components/CoursePlan.tsx): точна дата, зворотний відлік чи просто
 * «наступний за порядком» без жодної дати.
 */
function lockInfo(m: PlanModule): { label: string; kind: LockKind } | null {
  if (m.canPlay) return null;
  if (m.status === "passed") return null; // складений на 100% — не «замок», просто нічого покращувати
  if (m.unlocksAt) return { label: `Відкриється ${formatDate(m.unlocksAt)}`, kind: "date" };
  if (m.unlockAfterDays) {
    return { label: `Через ${m.unlockAfterDays} ${pluralDays(m.unlockAfterDays)} після попереднього`, kind: "days" };
  }
  if (m.waitingForPrevious) return { label: "Після попереднього модуля", kind: "sequence" };
  return null;
}

function paceLabel(plan: CoursePlan): string | null {
  const pace = plan.pace;
  if (!pace) {
    return plan.remainingCount > 0 ? "Без дедлайну — проходьте у власному темпі" : null;
  }
  if (pace.overdue) {
    const late = Math.abs(pace.daysLeft);
    return `Дедлайн минув ${late} ${pluralDays(late)} тому — лишилось ${plan.remainingCount} з ${plan.modules.length}`;
  }
  if (pace.blockedByCooldowns) {
    return `До дедлайну ${pace.daysLeft} ${pluralDays(pace.daysLeft)}, але паузи між модулями довші — попередьте керівника`;
  }
  if (pace.daysLeft <= 7) {
    return `Лишилось ${pace.daysLeft} ${pluralDays(pace.daysLeft)} і ${plan.remainingCount} модулів — плануйте ${formatMinutes(plan.remainingMinutes)}`;
  }
  return `Щоб встигнути: ${pace.modulesPerWeek} ${pace.modulesPerWeek === 1 ? "модуль" : "модулі"} на тиждень`;
}

/** Підпис «наступна спроба через …» рахується від МОМЕНТУ показу плану:
 *  сервер рендерить сторінку, тож час свіжий. */
function formatWait(until: Date, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60000));
  if (minutes < 60) return `${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} год ${rest} хв` : `${hours} год`;
}

function pluralModules(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "модулів";
  if (last === 1) return "модуль";
  if (last >= 2 && last <= 4) return "модулі";
  return "модулів";
}

/**
 * Статус сертифіката — компактний факт замість окремого банера-гасла
 * (2026-09-17: банер "Пройдіть курс на всі 100%!" висів над планом як
 * гучний слоган і не ніс нової інформації понад те, що вже сказано
 * підписом кнопки "Сертифікат" на завершеному курсі).
 *
 * "Отримано" — курс повністю пройдено і КОЖЕН модуль на 100% (не лише
 * "складено": passed означає лише прохідний бал, не ідеальний результат).
 * Якщо хоч один пройдений модуль нижче 100% — курс ще можна закрити на
 * сертифікат, перепройшовши саме його (кнопка "Покращити результат" у
 * рядку модуля), тож підпис лишається цілі, а не "недоступно".
 */
function certificateStatus(plan: CoursePlan, certificateEnabled: boolean): { label: string; earned: boolean } | null {
  if (!certificateEnabled || plan.modules.length === 0) return null;
  const earned = plan.remainingCount === 0 && plan.modules.every((m) => m.scorePercent === 100);
  // "За 100% усіх модулів" не вміщалось у два рядки плашки, як сусідні
  // факти (2026-09-18, скарга користувача) — підпис "Сертифікат" під
  // великим текстом і так каже, ЩО це за факт, тож саме значення можна
  // скоротити до самої умови.
  return { label: earned ? "Отримано" : "За 100%", earned };
}

/**
 * Дописує "· ще ~T хв" до підпису темпу/графіка — те, що раніше стояло
 * окремим фактом "Лишилось часу" у плашках над планом (2026-09-17: після
 * прибирання плашок час не мав загубитись, бо саме він відповідає на
 * "скільки робочого часу закласти", заради чого план і існує).
 *
 * Не дублює час, якщо підпис уже його називає (гілка pace з daysLeft<=7
 * сама каже "плануйте T"), і не додає його там, де поруч і так покажеться
 * інший рядок із тим самим числом (`skip` — прострочений дедлайн одночасно
 * зі своїм рядком графіка, див. toPlanView).
 */
function appendRemainingTime(label: string | null, plan: CoursePlan, skip = false): string | null {
  if (!label || skip || plan.remainingCount === 0) return label;
  if (label.includes("хв") || label.includes("год")) return label;
  return `${label} · ще ${formatMinutes(plan.remainingMinutes)}`;
}

function scheduleLabel(plan: CoursePlan): string | null {
  const s = plan.schedule;
  if (!s || plan.remainingCount === 0) return null;
  const step = `${s.moduleDays} ${pluralDays(s.moduleDays)} на модуль`;
  if (s.status === "behind") {
    return `Відстаєте від графіка на ${s.behindBy} ${pluralModules(s.behindBy)} — рекомендовано ${step}`;
  }
  if (s.status === "ahead") {
    return `Випереджаєте графік на ${-s.behindBy} ${pluralModules(-s.behindBy)} — рекомендовано ${step}`;
  }
  return `Ви йдете за графіком — рекомендовано ${step}`;
}

export function toPlanView(plan: CoursePlan, certificateEnabled = true): CoursePlanView {
  const cert = certificateStatus(plan, certificateEnabled);
  return {
    modules: plan.modules.map((m) => {
      const lock = lockInfo(m);
      return {
      id: m.id,
      order: m.order,
      title: m.title,
      status: m.status,
      scoreLabel: m.scorePercent != null ? `${m.scorePercent}%` : null,
      scorePercent: m.scorePercent,
      medalTier: medalTier(m.scorePercent),
      completedAtLabel: m.completedAt ? formatDate(m.completedAt) : null,
      // Орієнтовна оцінка (з "≈") — поки не пройдено. Щойно з'явився
      // РЕАЛЬНИЙ час останньої спроби (2026-09-17) — показуємо його як
      // факт, без знака приблизності: людина сама його й витратила.
      timeLabel: m.actualMinutes != null ? formatMinutes(m.actualMinutes) : `≈ ${formatMinutes(m.estimatedMinutes)}`,
      isNext: m.isNext,
      canPlay: m.canPlay,
      canRetake: m.canRetake,
      lockLabel: lock?.label ?? null,
      lockKind: lock?.kind ?? null,
      retakeLabel: m.retryBlockedUntil
        ? `Вільні спроби вичерпано — наступна через ${formatWait(m.retryBlockedUntil)}`
        : m.retakeAvailableAt
          ? `Перепройти можна з ${formatDate(m.retakeAvailableAt)}`
          : null,
      actionLabel: moduleAction(m),
      targetLabel: m.targetDate ? `до ${formatDate(m.targetDate)}` : null,
      behindTarget: m.behindTarget,
      };
    }),
    totalTimeLabel: formatMinutes(plan.totalMinutes),
    remainingTimeLabel: formatMinutes(plan.remainingMinutes),
    passedCount: plan.passedCount,
    moduleCount: plan.modules.length,
    remainingCount: plan.remainingCount,
    assignedAtLabel: plan.assignedAt ? formatDate(plan.assignedAt) : null,
    dueDateLabel: plan.dueDate ? formatDate(plan.dueDate) : null,
    // Прострочений дедлайн одночасно з активним графіком показує ОБИДВА
    // рядки (нижче в CoursePlanPanel) — час дописуємо лише в pace-рядок,
    // інакше він продублювався б у сусідньому реченні графіка.
    paceLabel: appendRemainingTime(paceLabel(plan), plan),
    scheduleLabel: appendRemainingTime(scheduleLabel(plan), plan, Boolean(plan.pace?.overdue)),
    scheduleStatus: plan.schedule ? plan.schedule.status : null,
    overdue: Boolean(plan.pace?.overdue),
    nextModuleId: plan.nextModuleId,
    certificateLabel: cert?.label ?? null,
    certificateEarned: cert?.earned ?? false,
  };
}
