"use client";

import { useEffect, useState } from "react";
import { MorphIcon } from "morphicons/react";

/**
 * Іконка, що "промальовується" морфом при появі на екрані — той самий
 * рушій (morphicons), що вже перевірений в артефакті Morph Playground
 * (запит користувача, 2026-09-19: перенести з артефакта в реальний
 * застосунок). SSR-безпечно: перший рендер (і сервер, і клієнт до
 * ефекту) показує НЕЙТРАЛЬНУ крапку як звичайний статичний `d` — жодного
 * "стрибка" вмісту чи гідратаційного мисматчу; лише за тік після
 * монтування пропс `icon` змінюється на цільову фігуру, і бібліотека сама
 * програє перехід. `label` — сенс для читалок екрана НЕЗАЛЕЖНО від того,
 * яка фігура саме зараз намальована (MorphIcon: без label — aria-hidden).
 * `reducedMotion="user"` — бібліотека сама вимикає морф на
 * prefers-reduced-motion, миттєво показуючи цільову фігуру.
 */
const SHAPES = {
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
} as const;

const NEUTRAL = "M12 12h.01";

export type MorphRevealShape = keyof typeof SHAPES;

export function MorphRevealIcon({
  shape,
  label,
  size = 24,
  strokeWidth = 2.4,
  className,
  /** Затримка перед морфом, мс — 0 скрізь, крім плану курсу
   *  (components/CoursePlan.tsx): там галочка кожного складеного модуля
   *  має "промальовуватись" синхронно з тим самим сплеском масштабу
   *  вузла (2026-09-22, рішення користувача), а не вся одразу на 60мс. */
  delay = 0,
}: {
  shape: MorphRevealShape;
  label?: string;
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  delay?: number;
}) {
  const [icon, setIcon] = useState<string>(NEUTRAL);

  useEffect(() => {
    const t = setTimeout(() => setIcon(SHAPES[shape]), 60 + delay);
    return () => clearTimeout(t);
  }, [shape, delay]);

  return (
    <MorphIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      reducedMotion="user"
      label={label}
    />
  );
}
