/**
 * Перший вхід на телефоні/комп’ютері (app/register/page.js): де ми в
 * послідовності «Вітаємо → інструкція встановлення → форма» /
 * «Застосунок готовий → форма» (2026-09-18, редизайн — раніше інструкція
 * була лише спливною модалкою поверх форми реєстрації).
 *
 * Інструкція встановлення сама — готова анімована сторінка
 * public/guide/install.html (iPhone/Android/комп’ютер визначається в НІЙ
 * САМІЙ за user agent, без ручного перемикача), показується або на весь
 * екран під час онбордингу (components/InstallGuide.tsx InstallGuideEmbed),
 * або в модалці з шторки налаштувань (InstallGuideModal).
 */
export const GUIDE_URL = "/guide/install.html";

/** Скільки чекати на екрані-переході, перш ніж САМ перейти далі (мс) —
 *  той самий проміжок і для JS-таймера, і для CSS-анімації прогрес-бару
 *  (style="animationDuration"), щоб не розходились. */
export const ONBOARD_DELAY_MS = 6000;
/** «Вітаємо» довший за ONBOARD_DELAY_MS: тексту там більше (опис платформи
 *  + 3 пункти переваг, ~40 слів) — на середній швидкості читання це
 *  ближче до 10-12с, 6с обрізали б ознайомлення заради автопереходу
 *  (користувач, 2026-09-18: «лінію часу зроби більшою для ознайомлення»).
 *  «Застосунок готовий» — короткий підпис, лишається на ONBOARD_DELAY_MS. */
export const WELCOME_DELAY_MS = 9000;

// Історична назва ключа — лишена як є з першої версії (лише модалка
// інструкції); зміна не варта того, щоб у вже встановлених на пристроях
// колег стан онбордингу «злетів» і показався ще раз.
const WELCOME_SEEN_KEY = "carls_install_guide_seen";
const STANDALONE_SEEN_KEY = "carls_standalone_intro_seen";

/** Уже відкрито з іконки (PWA), не з браузера. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

/** «Вітаємо» + інструкція — у браузері, доки людина не пройшла/не пропустила хоч раз. */
export function shouldShowWelcome(): boolean {
  if (isStandalone()) return false;
  try {
    return !localStorage.getItem(WELCOME_SEEN_KEY);
  } catch {
    return false;
  }
}

export function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, String(Date.now()));
  } catch {
    // приватний режим — покажеться ще раз наступного разу, не критично
  }
}

/** «Застосунок готовий!» — при ПЕРШОМУ відкритті зі збереженої іконки. */
export function shouldShowStandaloneIntro(): boolean {
  if (!isStandalone()) return false;
  try {
    return !localStorage.getItem(STANDALONE_SEEN_KEY);
  } catch {
    return false;
  }
}

export function markStandaloneIntroSeen() {
  try {
    localStorage.setItem(STANDALONE_SEEN_KEY, String(Date.now()));
  } catch {
    // приватний режим — покажеться ще раз наступного разу, не критично
  }
}
