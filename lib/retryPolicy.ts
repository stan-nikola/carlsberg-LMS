/**
 * Правила перескладання проваленого модуля (2026-09-17).
 *
 * Практика розходиться на два табори. Сертифікаційні іспити (Microsoft,
 * CompTIA, CISA) ставлять паузу добу після першого провалу й тижні після
 * наступних — там мета не навчити, а не дати заучити питання. Навчання на
 * освоєння (mastery learning) дає необмежені спроби: постійна величина —
 * знання, змінна — час. Наша платформа — другий випадок, тож миттєвий
 * повтор лишається дефолтом.
 *
 * Але в mastery learning є умова, без якої «відповідай, поки не вгадаєш»
 * перетворюється на перебір варіантів: інший набір питань і повернення до
 * матеріалу між спробами. Звідси «м'яке гальмо» — перші N спроб підряд
 * вільні, далі коротка пауза в годинах; плюс пул питань
 * (Module.questionPoolSize) і повтор через увесь матеріал модуля.
 *
 * Чиста функція без prisma й React — щоб те саме правило однаково рахували
 * і сервер (сесія плеєра, API), і план курсу, і прев'ю в конструкторі.
 */

export type RetryRules = {
  /** Скільки спроб підряд без паузи. null — без обмежень. */
  freeAttempts: number | null;
  /** Пауза в годинах після вичерпання вільних спроб. null/0 — без паузи. */
  cooldownHours: number | null;
};

export type RetryGate = {
  /** Чи можна почати нову спробу просто зараз. */
  canRetryNow: boolean;
  /** Скільки вільних спроб лишилось (null — не обмежено). */
  attemptsLeft: number | null;
  /** Коли можна буде спробувати знову, якщо зараз не можна. */
  nextAttemptAt: Date | null;
  /** Скільки спроб уже зроблено. */
  attemptsMade: number;
};

const NO_RULES: RetryRules = { freeAttempts: null, cooldownHours: null };

/**
 * Правила для конкретного модуля: власні поля модуля мають пріоритет над
 * курсом, як і з паузами між модулями. Значення 0 у модуля — це
 * усвідомлений «нуль», а не «успадкувати» (тому ?? , а не ||).
 */
export function resolveRetryRules(
  course: { retryFreeAttempts?: number | null; retryCooldownHours?: number | null } | null,
  courseModule: { retryFreeAttempts?: number | null; retryCooldownHours?: number | null } | null
): RetryRules {
  if (!course && !courseModule) return NO_RULES;
  return {
    freeAttempts: courseModule?.retryFreeAttempts ?? course?.retryFreeAttempts ?? null,
    cooldownHours: courseModule?.retryCooldownHours ?? course?.retryCooldownHours ?? null,
  };
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Чи відкрита наступна спроба провaленого модуля.
 *
 * @param completion останній запис про проходження модуля (null — ще не проходив)
 * @param rules      правила з resolveRetryRules
 */
export function retryGate(
  completion: { passed: boolean; completedAt: Date; attemptCount: number } | null,
  rules: RetryRules,
  now: Date = new Date()
): RetryGate {
  // Ще не проходив або вже склав — це не «перескладання», гальмо не діє.
  if (!completion || completion.passed) {
    return {
      canRetryNow: true,
      attemptsLeft: rules.freeAttempts ?? null,
      nextAttemptAt: null,
      attemptsMade: completion ? completion.attemptCount : 0,
    };
  }

  const made = completion.attemptCount;
  if (rules.freeAttempts == null) {
    return { canRetryNow: true, attemptsLeft: null, nextAttemptAt: null, attemptsMade: made };
  }

  // attemptCount рахує і ПЕРШУ (провалену) спробу, а freeAttempts — це
  // повтори ПІСЛЯ неї. Без «- 1» retryFreeAttempts:1 давав нуль вільних
  // повторів («Вільні спроби вичерпано» одразу після першого провалу), а
  // 0 і 1 поводились однаково (знайдено стендом механіки, 2026-09-22).
  const left = Math.max(0, rules.freeAttempts - (made - 1));
  if (left > 0) {
    return { canRetryNow: true, attemptsLeft: left, nextAttemptAt: null, attemptsMade: made };
  }

  // Вільні спроби вичерпано. Без паузи — просто пускаємо далі: обмеження
  // спроб саме по собі нічого не дає, якщо наступну можна почати одразу.
  if (!rules.cooldownHours) {
    return { canRetryNow: true, attemptsLeft: 0, nextAttemptAt: null, attemptsMade: made };
  }

  const opensAt = addHours(completion.completedAt, rules.cooldownHours);
  if (opensAt <= now) {
    return { canRetryNow: true, attemptsLeft: 0, nextAttemptAt: null, attemptsMade: made };
  }
  return { canRetryNow: false, attemptsLeft: 0, nextAttemptAt: opensAt, attemptsMade: made };
}

/** «за 2 години 15 хвилин» — підпис часу до наступної спроби. */
export function formatWait(nextAttemptAt: Date, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.ceil((nextAttemptAt.getTime() - now.getTime()) / 60000));
  if (minutes < 60) return `${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} год ${rest} хв` : `${hours} год`;
}

/**
 * Скільки питань показати за спробу і які саме — випадкова вибірка з усіх
 * питань модуля. Вибірка робиться НА СЕРВЕРІ: інакше повний список питань
 * приїхав би в браузер і його можна було б підглянути в коді сторінки.
 *
 * Питання без відповідей (порожній модуль) і pool >= кількості питань
 * лишають усе як є — тиха деградація, а не помилка.
 *
 * @param ids   id quiz-компонентів модуля в порядку курсу
 * @param size  Module.questionPoolSize
 * @param rand  генератор [0,1) — у тестах підміняється детермінованим
 */
export function pickQuestionPool(ids: number[], size: number | null | undefined, rand: () => number = Math.random): Set<number> {
  if (!size || size <= 0 || size >= ids.length) return new Set(ids);
  const rest = [...ids];
  const picked: number[] = [];
  while (picked.length < size && rest.length > 0) {
    const i = Math.floor(rand() * rest.length);
    picked.push(rest.splice(i, 1)[0]);
  }
  return new Set(picked);
}
