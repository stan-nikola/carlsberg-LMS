/**
 * Скільки часу (частка 0..1 від повної тривалості) минає на CSS
 * `cubic-bezier(x1,y1,x2,y2)`-кривій, поки її прогрес-значення (Y)
 * досягне заданої частки (2026-09-22, рішення користувача: сплеск
 * масштабу й галочка на вузлі плану курсу мають спрацьовувати РІВНО в
 * момент, коли лінія (CSS-transition на var(--ease-premium)) візуально
 * заїжджає в його кружечок — не пропорційно індексу картки, бо та крива
 * не лінійна: заповнюється швидко на старті й лише гальмує в кінці, тож
 * "картка N зі стовпчика M" насправді проходиться в РІЗНИЙ момент часу,
 * залежно від того, де саме M на кривій).
 *
 * Бісекція, не Ньютон: Y(t) монотонна для звичайних easing-кривих (як
 * --ease-premium), і бісекція гарантовано сходиться без ризику ділення на
 * нуль у похідній — тут не потрібна швидкість Ньютона заради 20 кадрів.
 */
function bezierComponent(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

/**
 * @param progress Цільова частка (0..1) прогрес-значення (Y) кривої.
 * @returns Частка часу (0..1, X кривої) — помножити на реальну
 *   тривалість анімації, щоб отримати мілісекунди.
 */
export function cubicBezierTimeAtProgress(x1: number, y1: number, x2: number, y2: number, progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2;
    if (bezierComponent(mid, y1, y2) < progress) lo = mid;
    else hi = mid;
  }
  return bezierComponent((lo + hi) / 2, x1, x2);
}
