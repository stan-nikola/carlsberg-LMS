import localFont from "next/font/local";
import { Montserrat, IBM_Plex_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { PLATFORM_NAME, PLATFORM_SHORT_NAME, PLATFORM_TAGLINE } from "@/lib/branding";
import "@/app/styles/tokens.css";
import "./globals.css";
import "@/app/styles/registration.css";
import "@/app/styles/hub.css";
import "@/app/styles/course-player.css";
import "@/app/styles/admin.css";
import "@/app/styles/manager.css";

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

export const metadata = {
  title: PLATFORM_NAME,
  description: PLATFORM_TAGLINE,
  // Android/Chrome читає app/manifest.js (файлова конвенція App Router,
  // Next сам підключає <link rel="manifest">). iOS Safari той файл
  // ігнорує — "Додати на головний екран" там орієнтується саме на ці
  // apple-* мета-теги/лінк, інакше теж відкриває звичайну вкладку з
  // адресним рядком замість повноекранного застосунку.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: PLATFORM_SHORT_NAME,
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
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

export default function RootLayout({ children }) {
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
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
