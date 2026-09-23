"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Кільце з відсотком — той самий strokeDasharray-прийом, що вже є в
 * SpinnerIcon (components/icons.jsx), тільки з реальним % замість
 * нескінченного обертання. Компактний варіант (тонше обведення) для сітки
 * 2×2 замість одного великого кільця, яке займало багато місця під
 * один-єдиний показник.
 *
 * Товщина обведення й форма кінців дуги задаються НЕ тут, а токенами
 * --chart-ring-w / --chart-ring-cap через .mgr-ring у
 * app/styles/manager.css: презентаційні атрибути SVG (stroke-width,
 * stroke-linecap) значень var() не приймають, а однойменні
 * CSS-властивості — приймають, і тоді кільце крутиться на стенді
 * /admin/design разом із рештою.
 *
 * Живе окремим файлом, а не всередині ManagerDashboard, саме щоб стенд
 * дизайн-системи показував ЦЕЙ компонент, а не схожу на нього копію —
 * інакше прев'ю рано чи пізно розійдеться з тим, що бачить керівник.
 *
 * Заповнення анімується від 0 при першому рендері (mounted-стан +
 * transition на stroke-dasharray, --dur-slow/--ease-premium — ті самі
 * токени руху, що й скрізь у проєкті), а не миттєво стрибає на фінальне
 * значення.
 */

export function CompletionRing({
  pct,
  label,
  color = "var(--cb-secondary)",
  href,
}: {
  pct: number;
  label?: string;
  color?: string;
  /** Drill-down: усе кільце стає посиланням на список за цим показником. */
  href?: string;
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = animated ? (clamped / 100) * circumference : 0;
  const inner = (
    <>
      <svg viewBox="0 0 120 120" className="mgr-ring" role="img" aria-label={`${label ? label + ": " : ""}${clamped}%`}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          /* Заокруглений кінець на дузі НУЛЬОВОЇ довжини малюється як
             крапка — вона блимала б у першому кадрі (dash = 0 до старту
             анімації) і назавжди лишалась би на показнику 0%. Клас
             вимикає заокруглення саме там; прямий кінець нічого не малює. */
          className={`mgr-ring-fill${dash > 0 ? "" : " mgr-ring-fill-zero"}`}
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="67" textAnchor="middle" className="mgr-ring-text">
          {clamped}%
        </text>
      </svg>
      {label && <span className="mgr-ring-label">{label}</span>}
    </>
  );

  return href ? (
    <Link href={href} className="mgr-ring-item mgr-card-link">
      {inner}
    </Link>
  ) : (
    <div className="mgr-ring-item">{inner}</div>
  );
}
