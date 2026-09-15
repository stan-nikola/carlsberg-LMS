/**
 * Єдине джерело правди для назви й логотипа платформи — раніше "CLS
 * Carlsberg Learning System"/"CLS"/"Платформа адаптації та навчання" були
 * розкидані буквальними рядками по app/manifest.js, app/layout.js,
 * components/HubShell.jsx, components/ManagerShell.jsx, Excel-звіту й
 * PDF-сертифіката — перейменування платформи означало б шукати й
 * переправляти рядок у кожному з цих місць окремо (і легко щось
 * пропустити). Тепер досить змінити значення тут.
 *
 * PLATFORM_LOGO_PATH — той самий PWA-іконка-файл, що вже є в
 * public/icons/ (офіційна іконка застосунку, не новостворена) — єдине
 * місце, звідки логотип підтягується там, де потрібне зображення (PDF-
 * сертифікат). Щоб замінити логотип — досить покласти новий файл за цим
 * самим шляхом або переправити сам шлях тут.
 */
export const PLATFORM_NAME = "CarLS Carlsberg Learning & Support";
export const PLATFORM_SHORT_NAME = "CarLS";
// Розшифровка абревіатури — дрібним підписом під самотнім "CarLS" там,
// де повна PLATFORM_NAME не влазить (сайдбар/аппбар кабінету керівника).
export const PLATFORM_ABBREVIATION_EXPANSION = "Carlsberg Learning & Support";
export const PLATFORM_TAGLINE = "Платформа адаптації та навчання Carlsberg Ukraine";
export const PLATFORM_LOGO_PATH = "public/icons/icon-192.png";
// Трилисток-логотип у спільній бренд-мітці (components/PlatformBrand.jsx,
// рендериться в ManagerShell.jsx/HubShell.jsx/AdminShell.jsx/
// app/register/page.js), веб-шлях (з провідного "/", не файлова FS-путь,
// як PLATFORM_LOGO_PATH вище). Суцільна заливка — той самий знак, що й у
// PWA-іконці (public/icons/), а не лінійний hops-leaf-small-green.png:
// той на ~30px в аппбарі Android «зливався в пляму» з тонких ліній
// (скарга користувача 2026-09-14). Лінійні hops-leaf-* лишаються лише
// декоративною текстурою (водяний знак на .profile-card, PDF-сертифікат)
// — там, де для цього є площа.
export const PLATFORM_HOP_LOGO_PATH = "/assets/brand/trefoil-solid-green.png";
