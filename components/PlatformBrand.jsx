import Image from "next/image";
import { PLATFORM_SHORT_NAME, PLATFORM_ABBREVIATION_EXPANSION, PLATFORM_HOP_LOGO_PATH } from "@/lib/branding";

/**
 * Єдиний вигляд бренд-мітки платформи — хмелевий трилисток ліворуч,
 * "CLS" + розшифровка двома рядками праворуч. Раніше
 * components/ManagerShell.jsx і components/HubShell.jsx кожен малював
 * свій власний фрагмент бренду окремо (десь лише "CLS", десь лише
 * гасло "Платформа адаптації та навчання" без жодного лого) — тепер
 * один спільний компонент, щоб "CLS"/лого не розходились знову після
 * наступної правки одного з двох місць (той самий принцип, що вже
 * задокументований у lib/branding.js для самих рядків).
 *
 * Лого — висота підібрана під висоту сусіднього двострічкового тексту
 * ("CLS" + розшифровка) у кожному розмірі (виміряно живим рендером, не
 * навмання): `height:100%` + flex-stretch тут НЕ спрацював — Next/Image
 * сам додає inline aspect-ratio/розміри, які перебивали CSS-розтягування
 * і замість цього рендерили картинку в її повний інтринзик-розмір
 * (1482×1379px) — тому явний px, як і в решті іконок проєкту. Пропорції
 * 1482:1379 (реальні px public/assets/brand/hops-leaf-small-green.png)
 * збережено — ширина рахується з висоти, не окреме число.
 *
 * `size`: "lg" — сайдбар кабінету керівника (більший текст), "sm" —
 * компактні місця (мобільний appbar кабінету керівника, appbar хаба
 * співробітника).
 */
const LOGO_ASPECT = 1482 / 1379;
const LOGO_HEIGHT = { lg: 38, sm: 30 };

export function PlatformBrand({ size = "sm" }) {
  const height = LOGO_HEIGHT[size] ?? LOGO_HEIGHT.sm;
  const width = Math.round(height * LOGO_ASPECT);
  return (
    <div className={`platform-brand platform-brand-${size}`}>
      <Image src={PLATFORM_HOP_LOGO_PATH} alt="" width={width} height={height} className="platform-brand-logo" />
      <span className="platform-brand-text">
        <span className="platform-brand-name">{PLATFORM_SHORT_NAME}</span>
        <span className="platform-brand-full">{PLATFORM_ABBREVIATION_EXPANSION}</span>
      </span>
    </div>
  );
}
