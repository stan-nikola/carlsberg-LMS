// Файлова конвенція App Router — Next.js сам генерує /manifest.webmanifest
// і підключає <link rel="manifest"> в <head>, окремо нічого лінкати не
// треба. Без цього файлу "Додати на головний екран" на Android відкриває
// звичайну вкладку браузера (з адресним рядком), а не повноекранний
// застосунок зі своєю іконкою — саме це і було проблемою.
//
// Іконки — ті самі, що вже використовувались у legacy vanilla-JS версії
// (legacy/manifest.json), просто скопійовані в public/icons/, не нові.
export default function manifest() {
  return {
    name: "CLS Carlsberg Learning System",
    short_name: "CLS",
    description: "Платформа адаптації та навчання Carlsberg Ukraine",
    start_url: "/hub",
    id: "/hub",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "uk",
    dir: "ltr",
    // Фірмовий themePrimary (Malty) — той самий колір, що й viewport.themeColor
    // у app/layout.js та --cb-primary в app/styles/tokens.css.
    background_color: "#ffffff",
    theme_color: "#00321E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
