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
export const PLATFORM_NAME = "CLS Carlsberg Learning System";
export const PLATFORM_SHORT_NAME = "CLS";
// Розшифровка абревіатури — дрібним підписом під самотнім "CLS" там, де
// повна PLATFORM_NAME не влазить (сайдбар/аппбар кабінету керівника).
export const PLATFORM_ABBREVIATION_EXPANSION = "Carlsberg Learning System";
export const PLATFORM_TAGLINE = "Платформа адаптації та навчання Carlsberg Ukraine";
// Без "Carlsberg Ukraine" — коротший варіант для тісних місць (сайдбар/аппбар хаба й кабінету керівника).
export const PLATFORM_TAGLINE_SHORT = "Платформа адаптації та навчання";
export const PLATFORM_LOGO_PATH = "public/icons/icon-192.png";
