/**
 * Прокрутити ЕЛЕМЕНТ у полі зору за ТОЧНО задану тривалість (2026-09-22,
 * рішення користувача: швидкість скролу до потрібного модуля плану курсу
 * має збігатись зі швидкістю заливки зеленої лінії — components/CoursePlan.tsx
 * ROAD_DRAW_MS). Нативний `scrollIntoView({behavior:"smooth"})`/`scrollTo`
 * тривалості не приймають — браузер сам вирішує, скільки це триває, тож
 * єдиний спосіб гарантовано синхронізувати два різні анімовані шари
 * (SVG-лінія на CSS-transition і сам скрол) — власний rAF-цикл із тим
 * самим числом мілісекунд.
 */

/** Найближчий скрольований предок (`overflow-y: auto/scroll` і реально
 *  має що скролити) — та сама позиція незалежно від того, де саме
 *  змонтовано план курсу (CourseReview на /courses/[slug], чи вступний
 *  екран CoursePlayer, чи прев'ю в конструкторі). */
function findScrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Чи елемент уже ЦІЛКОМ у видимій зоні свого скрол-контейнера — тоді крутити нічого. */
export function isFullyInView(target: HTMLElement): boolean {
  const container = findScrollParent(target);
  const c = container === document.scrollingElement || container === document.documentElement
    ? { top: 0, bottom: window.innerHeight }
    : container.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  return r.top >= c.top && r.bottom <= c.bottom;
}

/**
 * @param target Елемент, який має опинитись у видимій зоні.
 * @param durationMs Тривалість анімації — той самий ROAD_DRAW_MS, щоб
 *   скрол і заливка лінії закінчились одночасно.
 * @param offsetRatio Наскільки нижче верху контейнера лишити ціль (0.28 —
 *   ближче до третини екрана згори, не впритул до краю).
 * @param shouldStop Перевіряється на кожному кадрі: true — анімація зупиняється
 *   там, де є (людина сама почала гортати — не боремося з нею).
 */
export function smoothScrollElementIntoView(
  target: HTMLElement,
  durationMs: number,
  offsetRatio = 0.28,
  shouldStop: () => boolean = () => false
): void {
  const container = findScrollParent(target);
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const startTop = container.scrollTop;
  const destTop = Math.max(
    0,
    startTop + (targetRect.top - containerRect.top) - containerRect.height * offsetRatio
  );
  const delta = destTop - startTop;
  if (Math.abs(delta) < 2) return;

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    container.scrollTop = destTop;
    return;
  }

  const start = performance.now();
  function step(now: number) {
    if (shouldStop()) return;
    const t = Math.min(1, (now - start) / durationMs);
    container.scrollTop = startTop + delta * easeOutCubic(t);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
