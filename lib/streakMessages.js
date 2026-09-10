/**
 * Мотиваційні тости за серію правильних відповідей поспіль (streak) —
 * портовано з попередньої vanilla-JS розробки "8 кроків телесейлінгу"
 * (streakCopy/showStreakToast). Легка ефемерна штука без збереження —
 * лічильник живе лише в пам'яті плеєра на час проходження курсу.
 *
 * Кожне повідомлення: { threshold, repeatEvery, icon, title, sub }.
 *   threshold   — на якій серії поспіль спрацьовує вперше.
 *   repeatEvery — null = одноразово; число N = повторюється щоразу, коли
 *                 (streak - threshold) ділиться на N без остачі (у
 *                 legacy це був варіант "6, 9, 12..." для довгих серій).
 *   sub         — може містити {n}, підставляється поточним значенням streak.
 */

export const DEFAULT_STREAK_MESSAGES = [
  {
    threshold: 2,
    repeatEvery: null,
    icon: "🎯",
    title: "Чудовий старт!",
    sub: "Дві правильні відповіді поспіль — саме так формується впевненість на реальних дзвінках.",
  },
  {
    threshold: 4,
    repeatEvery: null,
    icon: "🔥",
    title: "Ви тримаєте темп!",
    sub: "Чотири правильні поспіль. Тримайте цей темп.",
  },
  {
    threshold: 6,
    repeatEvery: 3,
    icon: "🏆",
    title: "Вражаюча серія!",
    sub: "{n} правильних поспіль — ви точно знаєте цей матеріал.",
  },
];

/** Курс без своїх streakMessages бере ці — а не лишається зовсім без мотивації. */
export function courseStreakMessages(course) {
  const list = course?.streakMessages;
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_STREAK_MESSAGES;
}

/** Яке повідомлення (якщо є) показати за поточну серію streak. */
export function pickStreakMessage(streak, messages) {
  for (const m of messages) {
    if (streak === m.threshold) return m;
    if (m.repeatEvery && streak > m.threshold && (streak - m.threshold) % m.repeatEvery === 0) return m;
  }
  return null;
}

export function resolveStreakSub(message, streak) {
  return (message?.sub || "").replace("{n}", streak);
}
