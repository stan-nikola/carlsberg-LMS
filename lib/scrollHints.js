/**
 * Плавне підведення наступного елемента в плеєрі курсу.
 *
 * Навіщо власна функція, а не scrollIntoView({block:"start"}): той ставить
 * ціль під верхній край вікна, тобто прибирає з екрана те, що людина
 * щойно відкрила. Реальна скарга: відкриваєш картку акордеона — і її
 * власний текст одразу ж їде вгору, прочитати неможливо.
 *
 * Тому ціль підводиться не «на весь в'юпорт», а лише ВИГЛЯДАЄ знизу:
 * її верх опиняється на PEEK_RATIO висоти вікна. Попередній вміст
 * лишається перед очима, а наступний крок видно й зрозуміло, куди йти.
 */

/** Частка висоти вікна, на якій опиняється верх наступного елемента. */
const PEEK_RATIO = 0.72;

/** Не смикаємо екран заради кількох пікселів. */
const MIN_SHIFT_PX = 24;

/**
 * @param {Element|null|undefined} target
 * @param {{ peekRatio?: number }} [options]
 * @returns {number|null} на скільки пікселів прокрутили (null — не треба було)
 */
export function peekScrollTo(target, options = {}) {
  if (!target || typeof window === "undefined") return null;

  const peekRatio = options.peekRatio ?? PEEK_RATIO;
  const rect = target.getBoundingClientRect();
  const desiredTop = window.innerHeight * peekRatio;
  const shift = rect.top - desiredTop;

  // Ціль уже вище бажаної лінії — тягнути екран назад НЕ треба: людина
  // просто читає, а не «відстала».
  if (shift <= MIN_SHIFT_PX) return null;

  window.scrollBy({ top: shift, behavior: "smooth" });
  return Math.round(shift);
}

/**
 * Скільки прокрутити, щоб елемент показався (чиста функція — саме її
 * перевіряє тест, бо scrollBy у node-середовищі немає).
 *
 * @param {{top:number}} rect getBoundingClientRect цілі
 * @param {number} viewportHeight
 * @param {number} [peekRatio]
 * @returns {number} 0 — прокручувати не треба
 */
export function peekShift(rect, viewportHeight, peekRatio = PEEK_RATIO) {
  const shift = rect.top - viewportHeight * peekRatio;
  return shift > MIN_SHIFT_PX ? shift : 0;
}
