"use client";

import { useEffect, useRef, useState } from "react";

// Однакова ШВИДКІСТЬ (px/сек) для будь-якого тексту скрізь у проєкті —
// не однакова ТРИВАЛІСТЬ анімації. Фіксована тривалість (напр. 7s для
// всіх) означає, що довгий текст проходить більшу відстань за той самий
// час — тобто їде помітно швидше за короткий, що й виглядало як "різна
// швидкість у різних компонентах". База 50px/с — типова комфортна
// швидкість читання бігучого рядка, -20% (перший запит), потім ще -15%
// (другий запит) — сукупно ×0.8×0.85 від бази.
const MARQUEE_BASE_SPEED_PX_PER_SEC = 50;
const MARQUEE_SPEED_PX_PER_SEC = MARQUEE_BASE_SPEED_PX_PER_SEC * 0.8 * 0.85;
// @keyframes marquee-scroll (app/globals.css) тримає текст нерухомим
// перші й останні 15% циклу (читабельна пауза замість завжди-в-русі) —
// сам рух займає лише середні 70% загальної тривалості. Ділимо на цю ж
// частку тут, щоб додана пауза НЕ пришвидшувала фактичний рух (px/сек
// лишається MARQUEE_SPEED_PX_PER_SEC, а не зростає через коротший
// "робочий" відрізок анімації).
const MARQUEE_MOVE_FRACTION = 0.7;

/**
 * Текст, що замінює звичний "..." (text-overflow:ellipsis) на біжучий
 * рядок — але ЛИШЕ коли реально не влазить у контейнер (виміряно через
 * ResizeObserver, не завжди-анімація). Короткий текст рендериться як
 * звичайний inline-block, без жодної анімації чи дублювання розмітки.
 * prefers-reduced-motion вимикає рух глобально (app/globals.css), тут
 * додаткової логіки не треба.
 */
export function MarqueeText({ children, className = "", as: Tag = "span" }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  const [duration, setDuration] = useState(7);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    function check() {
      // +1px — щоб субпіксельне округлення не вмикало маркі на текст,
      // який насправді впритул влазить.
      const isOver = text.scrollWidth > container.clientWidth + 1;
      setOverflowing(isOver);
      if (isOver) {
        // Дистанція одного проходу = ширина одного примірника тексту
        // (translateX(-50%) від подвоєного вмісту) — звідси однакова
        // px/сек швидкість незалежно від довжини конкретного напису.
        setDuration(text.scrollWidth / MARQUEE_SPEED_PX_PER_SEC / MARQUEE_MOVE_FRACTION);
      }
    }
    check();

    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [children]);

  return (
    <Tag
      ref={containerRef}
      className={`marquee${overflowing ? " is-overflowing" : ""} ${className}`}
      style={overflowing ? { "--marquee-duration": `${duration}s` } : undefined}
    >
      <span className="marquee-inner">
        <span ref={textRef} className="marquee-text">
          {children}
        </span>
        {overflowing && (
          <span className="marquee-text" aria-hidden="true">
            {children}
          </span>
        )}
      </span>
    </Tag>
  );
}
