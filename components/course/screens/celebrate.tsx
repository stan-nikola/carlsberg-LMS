"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* ===================== STREAK TOAST (мотивація за серію) ===================== */

const CONFETTI_COLORS = ["#ffffff", "var(--gold)", "var(--green-300)"];

/**
 * Мотиваційний тост за серію правильних відповідей поспіль — банер, що
 * опускається зверху вниз у верхній частині екрана (CSS — .streak-toast*
 * у course-player.css), не в потоці контенту. Ефемерний: сам собою
 * ховається за таймером у components/course/player/CoursePlayer.tsx (тут лише візуал),
 * тому немає власного onClose — не заважає проходженню, просто зникає.
 */
export function StreakToast({ icon, title, sub }: { icon: ReactNode; title: ReactNode; sub?: ReactNode }) {
  // 7 шматочків конфеті з випадковою позицією/затримкою — рахуємо один
  // раз при монтуванні (не на кожен рендер), інакше вони "стрибали" б.
  const [pieces] = useState(() =>
    Array.from({ length: 7 }, (_, i) => ({
      left: 6 + Math.random() * 88,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 160,
    }))
  );

  return (
    <div className="streak-toast-overlay" aria-hidden="true">
      <div className="streak-toast" role="status">
        <span className="streak-toast-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="streak-toast-text">
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        <div className="streak-toast-confetti" aria-hidden="true">
          {pieces.map((p, i) => (
            <span
              key={i}
              className="streak-confetti-piece"
              style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Конфеті на весь екран — для фінального екрана курсу, пройденого на
 * 100%. Той самий прийом, що й у StreakToast (CSS-анімація, без
 * бібліотеки й без canvas), але більше шматочків і на всю висоту вікна,
 * а не в межах банера.
 *
 * Позиції рахуються один раз при монтуванні: інакше кожен ререндер
 * батька (а він там є — статус збереження результату) пересував би
 * шматочки посеред польоту.
 *
 * aria-hidden: це чисто декоративний шар. Сам факт "курс складено на
 * 100%" озвучений текстом поруч, тож читачеві екрана конфеті не потрібне.
 */
/* Палітра конфеті фінального екрана — лише фірмові токени (tokens.css), у
   випадковому порядку на кожну частинку: глибокий і яскравий зелені,
   золото, жовтий alert, success, синій notification. */
const TREFOIL_CONFETTI_COLORS = [
  "var(--cb-primary)",
  "var(--cb-secondary)",
  "var(--cb-tertiary)",
  "var(--cb-alert)",
  "var(--cb-success)",
  "var(--cb-notification)",
];

/* Пропорції public/assets/brand/trefoil-solid-green.png (1532×1417) — та
 * сама константа, що в components/shell/PlatformBrand.jsx. */
const TREFOIL_ASPECT = 1532 / 1417;

export function ConfettiBurst({ pieces = 40 }: { pieces?: number }) {
  // Трилистки замість квадратиків (користувач, 2026-09-15) — саме логотип
  // платформи (маска з PNG у course-player.css, .cp-confetti-piece), колір
  // випадковий з фірмової палітри, оберт — випадковий кут 180–540°, повільно
  // й плавно разом із падінням (одна анімація, той самий easing). База
  // падіння 3.3s — підібрана користувачем на стенді (2026-09-15).
  const [items] = useState(() =>
    Array.from({ length: pieces }, () => ({
      left: Math.random() * 100,
      color: TREFOIL_CONFETTI_COLORS[Math.floor(Math.random() * TREFOIL_CONFETTI_COLORS.length)],
      delay: Math.random() * 900,
      duration: 3300 + Math.random() * 1800,
      drift: Math.random() * 80 - 40,
      spin: Math.round((Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360)),
      size: 10 + Math.random() * 8,
    }))
  );

  // Портал у <body> (2026-10-04): картка плеєра — CSS-контейнер
  // (container-type, @container cp-card), а він стає межею для position:fixed
  // усередині — конфеті обрізались по картці, а не падали до низу екрана.
  // Свято показується лише після завершення в браузері, тож у серверному
  // рендері його нема (document тут завжди є).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="cp-confetti" aria-hidden="true">
      {items.map((p, i) => (
        <span
          key={i}
          className="cp-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size / TREFOIL_ASPECT}px`,
            color: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            "--drift": `${p.drift}px`,
            "--spin": `${p.spin}deg`,
          } as CSSProperties}
        />
      ))}
    </div>,
    document.body
  );
}
