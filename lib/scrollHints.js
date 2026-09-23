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

/** Відступ від нижнього краю, з яким має вміститись щойно відкрите. */
const KEEP_MARGIN_PX = 12;

/**
 * Найближчий предок, що реально прокручується. Плеєр курсу живе всередині
 * `.cp-viewport` (overflow-y:auto, фіксована висота телефонної рамки) —
 * і в /hub, і в прев'ю конструктора; саме вікно там не скролиться взагалі,
 * тож window.scrollBy мовчки нічого не робив (перевірено 2026-09-14:
 * scrollTop контейнера лишався 0). Якщо такого предка немає — скролимо
 * вікно, як і раніше.
 *
 * @param {Element} el
 * @returns {Element|null}
 */
export function findScrollParent(el) {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * @param {Element|null|undefined} target наступний елемент, який має
 *   «виглянути» знизу (може бути відсутній — напр., остання картка)
 * @param {{ peekRatio?: number, keepVisible?: Element|null }} [options]
 *   keepVisible — щойно відкритий елемент: його низ має лишитись на екрані,
 *   навіть якщо для цього треба прокрутити далі за peek-лінію. Потрібно на
 *   десктопі, де картки акордеона стоять у два стовпці: «наступна» картка —
 *   у тому ж ряду, її верх уже на місці, а розкритий текст відкритої
 *   обрізаний нижнім краєм (перевірено 2026-09-14: низ 447px при висоті
 *   в'юпорта 446).
 * @returns {number|null} на скільки пікселів прокрутили (null — не треба було)
 */
export function peekScrollTo(target, options = {}) {
  const keepVisible = options.keepVisible ?? null;
  const anchor = target || keepVisible;
  if (!anchor || typeof window === "undefined") return null;

  const peekRatio = options.peekRatio ?? PEEK_RATIO;
  const container = findScrollParent(anchor);

  // Для контейнера рахуємо від ЙОГО верхнього краю та висоти, для вікна —
  // від 0 та innerHeight; сама формула та сама (peekShift).
  const originTop = container ? container.getBoundingClientRect().top : 0;
  const viewportHeight = container ? container.clientHeight : window.innerHeight;
  const relative = (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top - originTop, bottom: r.bottom - originTop };
  };
  const shift = peekShift(
    target ? relative(target) : null,
    viewportHeight,
    peekRatio,
    keepVisible ? relative(keepVisible) : null,
    options.minShift
  );
  if (!shift) return null;

  (container ?? window).scrollBy({ top: shift, behavior: "smooth" });
  return Math.round(shift);
}

/**
 * Прокрутити контейнер елемента до самого низу. Для ОСТАННЬОЇ картки
 * акордеона (за проханням користувача 2026-09-15): «наступної» цілі
 * нема, а під розкритим текстом ще стоїть підказка/навігація — людина
 * має побачити, що екран дочитано до кінця, а не гадати, чи є щось нижче.
 *
 * @param {Element|null|undefined} el будь-який елемент усередині контейнера
 * @returns {boolean} чи було що крутити
 */
export function scrollToEnd(el) {
  if (!el || typeof window === "undefined") return false;
  const container = findScrollParent(el);
  const target = container ?? window;
  const max = container
    ? container.scrollHeight - container.clientHeight
    : document.documentElement.scrollHeight - window.innerHeight;
  const current = container ? container.scrollTop : window.scrollY;
  if (max - current <= MIN_SHIFT_PX) return false;
  target.scrollTo({ top: max, behavior: "smooth" });
  return true;
}

/**
 * Скільки прокрутити, щоб елемент показався (чиста функція — саме її
 * перевіряє тест, бо scrollBy у node-середовищі немає).
 *
 * @param {{top:number}|null} rect ціль (відносно верхнього краю того, що
 *   скролиться — вікна або контейнера); null — цілі немає, лише keepRect
 * @param {number} viewportHeight
 * @param {number} [peekRatio]
 * @param {{top:number, bottom:number}|null} [keepRect] щойно відкритий
 *   елемент, чий низ має вміститись (див. peekScrollTo)
 * @returns {number} 0 — прокручувати не треба
 */
export function peekShift(rect, viewportHeight, peekRatio = PEEK_RATIO, keepRect = null, minShift = MIN_SHIFT_PX) {
  let shift = rect ? rect.top - viewportHeight * peekRatio : 0;
  if (keepRect) {
    // Низ відкритого має влізти — навіть якщо peek-лінія цього не вимагає.
    const needed = keepRect.bottom - (viewportHeight - KEEP_MARGIN_PX);
    if (needed > shift) shift = needed;
    // …але верх відкритого ніколи не ховаємо за верхній край.
    if (shift > keepRect.top) shift = Math.max(keepRect.top, 0);
  }
  // minShift — мертва зона «не смикати екран заради кількох пікселів».
  // Для більшості випадків це правильно, але там, де елемент МУСИТЬ бути
  // видимим цілком (кнопка «Наступна репліка» в діалозі), навіть 10px
  // зрізаного краю — це обрізана кнопка, тож поріг там опускається.
  return shift > minShift ? shift : 0;
}
