import localFont from "next/font/local";
import { Montserrat, IBM_Plex_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { OfflineSync } from "@/components/OfflineSync";
import { DesignTokensOverride } from "@/components/DesignTokensOverride";
import { designCss, getSavedDesign } from "@/lib/designSettings";

// Токени дизайну читаються через lib/designSettings.ts (unstable_cache,
// 60с, revalidateTag при збереженні) — раніше тут стояв force-dynamic,
// який змушував рендеритись динамічно взагалі КОЖЕН маршрут застосунку
// (аудит швидкодії, 2026-09-18: причина відчуття «повільно скрізь» —
// сторінки, яким не потрібна сесія, більше не можуть кешуватись/бути
// статичними). Сторінки з реальною потребою в сесії (cookies()) лишаються
// динамічними самі по собі — Next визначає це автоматично.
import { PLATFORM_NAME, PLATFORM_SHORT_NAME, PLATFORM_TAGLINE } from "@/lib/branding";
import "@/app/styles/tokens.css";
import "./globals.css";
import "@/app/styles/registration.css";
import "@/app/styles/hub.css";
import "@/app/styles/course-player.css";
import "@/app/styles/admin.css";
import "@/app/styles/manager.css";
import "@/app/styles/notifications.css";
import "@/app/styles/rating.css";

// Carlsberg Sans — справжній фірмовий шрифт (не заміна на щось схоже під
// тим самим іменем). Файли — з ліцензійного пакету "Carlsberg Sans v3100"
// (внутрішній Carlsberg-актив, детальніше — public/fonts/carlsberg/README.md).
// Перевірено безпосередньо по гліфах (fontkit), не на слово: кирилиця й
// специфічно українські і/ї/є/ґ присутні в кожному з шести файлів — раніше
// саме відсутність кирилиці в Sora була причиною, чому заголовки малювались
// системним фолбеком, а не заявленим шрифтом.
const carlsbergSans = localFont({
  src: [
    { path: "../public/fonts/carlsberg/CarlsbergSans-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/carlsberg/CarlsbergSans-LightItalic.woff2", weight: "300", style: "italic" },
    { path: "../public/fonts/carlsberg/CarlsbergSans-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/carlsberg/CarlsbergSans-BoldItalic.woff2", weight: "700", style: "italic" },
    { path: "../public/fonts/carlsberg/CarlsbergSans-Black.woff2", weight: "900", style: "normal" },
    { path: "../public/fonts/carlsberg/CarlsbergSans-BlackItalic.woff2", weight: "900", style: "italic" },
  ],
  variable: "--font-carlsberg-sans",
  display: "swap",
  // Тільки 3 фірмові насичення (Light/Bold/Black) — саме тому в самому
  // гайді Carlsberg Sans використовується ЛИШЕ для великого display-
  // тексту/заголовків (усі приклади в брендбуку — "WE WILL CREATE A
  // WINNING CULTURE", ALL CAPS, великий кегль), ніколи для щільного
  // основного тексту. Тому --font-display (нижче) — Carlsberg Sans, а
  // --font-body лишається на Montserrat (є 400/500/600, потрібні для UI/
  // параграфів; це також той самий шрифт, що й офіційна цифрова
  // дизайн-система Carlsberg "Malty" використовує для власних продуктів).
});
const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

// Абсолютна адреса сайту — потрібна метаданим (og:image мусить бути
// абсолютним, інакше Telegram/Viber його просто не заберуть). На Vercel
// змінна є завжди; локально — сам dev-сервер.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: PLATFORM_NAME,
  description: PLATFORM_TAGLINE,
  // Прев'ю посилання в месенджерах. Без цього блока месенджер брав із
  // сторінки першу-ліпшу картинку — і на /register нею виявлялась
  // підказка «де взяти код» зі скріном Monolit Agent (скарга
  // користувача, 2026-09-23). Саме зображення — app/opengraph-image.tsx.
  openGraph: {
    type: "website",
    siteName: PLATFORM_SHORT_NAME,
    title: PLATFORM_NAME,
    description: PLATFORM_TAGLINE,
    locale: "uk_UA",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: PLATFORM_NAME,
    description: PLATFORM_TAGLINE,
  },
  // Android/Chrome читає app/manifest.js (файлова конвенція App Router,
  // Next сам підключає <link rel="manifest">). iOS Safari той файл
  // ігнорує — "Додати на головний екран" там орієнтується саме на ці
  // apple-* мета-теги/лінк, інакше теж відкриває звичайну вкладку з
  // адресним рядком замість повноекранного застосунку.
  appleWebApp: {
    capable: true,
    // "default", не "black-translucent": з прозорим рядком статусу iOS 26
    // малює над контентом смугу з блюром (скарга 2026-09-15, скрін з
    // iPhone). Непрозорий системний рядок стоїть НАД веб-в’ю, блюру нема.
    // Мета читається при встановленні — після зміни PWA треба перевстановити.
    statusBarStyle: "default",
    title: PLATFORM_SHORT_NAME,
    // iOS ігнорує background_color з app/manifest.js для сплеша при
    // холодному запуску PWA (на відміну від Android) — без явних
    // apple-touch-startup-image показує чорний екран, поки не домалюється
    // перший реальний контент (аудит "4 секунди чорний екран", 2026-09-19).
    // Один PNG на кожен поширений розмір iPhone (public/splash/, той самий
    // фон #ffffff, що й background_color у манифесті, трилисток по центру)
    // — iOS обирає точний збіг за media, точної відповідності нема —
    // фолбек усе одно чорний, але для більшості реальних пристроїв тепер
    // брендований сплеш замість пустого екрана.
    // orientation:portrait в КОЖНОМУ запиті — практично в усіх робочих
    // прикладах Apple/спільноти воно присутнє поруч із device-width/-height/
    // -webkit-device-pixel-ratio; без нього перший заход (лише 3 умови,
    // без orientation) не спрацював на реальному iPhone 17 Pro навіть після
    // повного видалення й перевстановлення PWA (2026-09-19).
    startupImage: [
      // Лінійка 17 (вийшла 2025-09-19, додано сюди 2026-09-19 — перший
      // список сплешів не міг її знати): iPhone 17 і 17 Pro фізично
      // ідентичні (1206x2622) — одна картинка на обидва.
      { url: "/splash/iphone17-17pro.png", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone17promax.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphoneair.png", media: "(device-width: 420px) and (device-height: 912px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone12-13-14.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone14pro-15-16.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone12-13-14promax.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone14-15-16promax.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphonex-11pro-12mini.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphonexr-11.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/iphonexsmax-11promax.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphonese-6-7-8.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
  // Іконки — файлові конвенції Next: app/favicon.ico, app/icon.png,
  // app/apple-icon.png (трилисник у digital-black, 2026-09-15); окремий
  // блок icons тут не потрібен, інакше <link> дублюються.
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Фірмовий themePrimary із Malty (themes/carlsberg.json) — той самий
  // колір, що й --cb-primary у app/styles/tokens.css.
  themeColor: "#00321E",
  colorScheme: "light",
};

export default async function RootLayout({ children }) {
  // Збережені супер-адміном токени (/admin/design → «Зберегти для всіх»)
  // поверх дефолтів tokens.css; локальне прев’ю (DesignTokensOverride,
  // inline style на <html>) має вищий пріоритет — у того, хто крутить стенд.
  const css = designCss((await getSavedDesign())?.values);
  return (
    <html
      lang="uk"
      className={`${carlsbergSans.variable} ${montserrat.variable} ${ibmPlexMono.variable}`}
      // Гасить попередження гідратації САМЕ для цього тега (не рекурсивно —
      // реальні розбіжності глибше в дереві й далі покажуться). Побачили
      // "A tree hydrated but some attributes... didn't match" однаково і на
      // /hub, і на /register (двох геть різних деревах) — спільний фактор
      // це <html>/<body>, а не конкретна сторінка; найімовірніша причина —
      // мобільний браузер/розширення (перекладач, темна тема, читалка),
      // що правлять DOM ще до гідратації — сам React прямо називає це
      // однією з типових причин.
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        {css && <style id="design-tokens">{css}</style>}
        <DesignTokensOverride />
        {children}
        <ServiceWorkerRegister />
        <OfflineSync />
      </body>
    </html>
  );
}
