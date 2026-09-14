import Image from "next/image";
import { PLATFORM_SHORT_NAME, PLATFORM_ABBREVIATION_EXPANSION, PLATFORM_HOP_LOGO_PATH } from "@/lib/branding";

/**
 * Єдиний вигляд бренд-мітки платформи — хмелевий трилисток ліворуч,
 * "CarLS" + розшифровка двома рядками праворуч. Раніше
 * components/ManagerShell.jsx і components/HubShell.jsx кожен малював
 * свій власний фрагмент бренду окремо (десь лише "CarLS", десь лише
 * гасло "Платформа адаптації та навчання" без жодного лого) — тепер
 * один спільний компонент, щоб "CarLS"/лого не розходились знову після
 * наступної правки одного з двох місць (той самий принцип, що вже
 * задокументований у lib/branding.js для самих рядків).
 *
 * Лого — висота підібрана під висоту сусіднього двострічкового тексту
 * ("CarLS" + розшифровка) у кожному розмірі (виміряно живим рендером, не
 * навмання): `height:100%` + flex-stretch тут НЕ спрацював — Next/Image
 * сам додає inline aspect-ratio/розміри, які перебивали CSS-розтягування
 * і замість цього рендерили картинку в її повний інтринзик-розмір
 * (1532×1417px) — тому явний px, як і в решті іконок проєкту. Пропорції
 * 1532:1417 (реальні px public/assets/brand/trefoil-solid-green.png, той
 * самий суцільний знак, що й PWA-іконка) збережено — ширина рахується з
 * висоти, не окреме число.
 *
 * `size`: "xl" — героїчний момент реєстрації/логіну (app/register/page.js,
 * єдине місце цього розміру), "lg" — сайдбар кабінету керівника, "sm" —
 * компактні місця (мобільний appbar кабінету керівника, appbar хаба
 * співробітника).
 * `stacked` — лого над текстом, по центру (3 рядки: лого / "CarLS" /
 * розшифровка), замість звичного рядка "лого ліворуч, текст праворуч".
 * Поки що лише для "xl" (реєстрація) — за проханням користувача.
 *
 * `unoptimized`: іконка трилистка зникала на екрані входу (реальний баг,
 * знайдений користувачем) — `<img>` зависав на запиті до `/_next/image`
 * НАЗАВЖДИ (не помилка, не 404 — просто ніколи не завершувався; прямий
 * curl на той самий URL відповідав миттєво, тобто це саме
 * рантайм-оптимізація/перекодування зображення в dev-режимі зависало,
 * а не сам файл чи мережа). Це вже готові PNG (public/assets/brand/
 * README.md — растеризовані вручну з офіційних .emf, прозорий фон,
 * antialiasing), не фото з телефону, яке треба стискати й підбирати
 * формат під кожен viewport — Next-оптимізація тут ніколи не давала
 * реальної користі, тільки нестабільний зайвий крок. `unoptimized`
 * віддає файл із /public напряму, як звичайний <img>.
 */
const LOGO_ASPECT = 1532 / 1417;
const LOGO_HEIGHT = { xl: 64, lg: 38, sm: 30 };

export function PlatformBrand({ size = "sm", stacked = false }) {
  const height = LOGO_HEIGHT[size] ?? LOGO_HEIGHT.sm;
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <div className={`platform-brand platform-brand-${size}${stacked ? " platform-brand-stacked" : ""}`}>
      <Image
        src={PLATFORM_HOP_LOGO_PATH}
        alt=""
        width={width}
        height={height}
        className="platform-brand-logo"
        priority={size === "xl"}
        unoptimized
      />
      <span className="platform-brand-text">
        <span className="platform-brand-name">{PLATFORM_SHORT_NAME}</span>
        <span className="platform-brand-full">{PLATFORM_ABBREVIATION_EXPANSION}</span>
      </span>
    </div>
  );
}
