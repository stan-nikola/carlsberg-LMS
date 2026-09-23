// Content-Security-Policy та інші security-заголовки (2026-09-18, аудит
// безпеки). 'unsafe-inline' у script-src/style-src — свідомий компроміс:
// "правильний" nonce-based CSP (node_modules/next/dist/docs/.../content-
// security-policy.md) вимагає, щоб УСІ сторінки рендерились динамічно
// (Proxy — новий Next 16 еквівалент middleware — генерує nonce на кожен
// запит), а це прибирає статичну оптимізацію/кешування по всьому
// застосунку — окрема, набагато більша архітектурна зміна, якої тут не
// просили. Навіть з 'unsafe-inline' CSP все одно реально захищає: блокує
// завантаження ЧУЖИХ скриптів/стилів (найпоширеніший XSS-вектор —
// підвантажити evil.com/payload.js), звужує img/connect/frame до відомих
// джерел і закриває clickjacking (frame-ancestors). XSS у самому коді
// застосунку не знайдено (аудит: жодного dangerouslySetInnerHTML) — CSP
// тут другий шар захисту, не єдиний.
function buildCsp({ frameAncestors = "'none'" } = {}) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // blob:/data: — Next.js own recommended default (next/image optimizer,
    // og-image тощо); *.public.blob.vercel-storage.com — фото уроків
    // (lib/adminSession.js upload), upload.wikimedia.org — тестові фото
    // курсів (обидва вже в images.remotePatterns нижче).
    "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com https://upload.wikimedia.org",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    // Вбудовані плеєри відео в екранах курсу (lib/videoEmbed.ts): автор
    // вставляє посилання на YouTube/Vimeo, і плеєр показується в <iframe>.
    // Без цих трьох джерел CSP глушить фрейм ще до запиту, і на екрані —
    // порожній сірий прямокутник без жодного натяку, що саме не так
    // (2026-09-23: перше ж вставлене посилання виглядало як «зламане
    // фото»). youtube.com поруч із nocookie-доменом навмисно: плеєр сам
    // переадресовує туди частину запитів.
    "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    // Лише прод: у dev застосунок навмисно тестують по LAN (телефон) на
    // звичайному http:// (TLS локально не піднятий) — ця директива
    // примушує браузер апгрейдити КОЖЕН підресурс (CSS/JS/картинки/шрифти)
    // на https, і на не-localhost origin (де браузер не вважає http
    // довіреним) запити на неіснуючий https тихо провалюються: сторінка
    // лишається геть без стилів. localhost цього не показує — браузери
    // вважають його довіреним і не чіпають.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cache Components (PPR) — миттєва навігація: статична "оболонка" екрана
  // рендериться одразу, дані сесії/БД доливаються окремим потоком поверх
  // неї (аудит "як в Instagram", 2026-09-19). Вмикається одним прапорцем,
  // після чого КОЖЕН маршрут мусить бути prerender-able — codemod
  // `cache-components-instant-false` вже розставив `export const instant =
  // false` на всіх page/layout/default як тимчасовий opt-out (позначено
  // `// TODO: Cache Components adoption`), знімаємо по одному екрану.
  cacheComponents: true,
  // Парний прапорець до cacheComponents (гайд "Instant navigation" вимагає
  // обидва): без нього кожен <Link> у viewport тягне окремий повний
  // пререндер призначення, з ним — один спільний App Shell на маршрут,
  // і саме App Shell несе дані сесії з "use cache: private" ще до кліку.
  // Локальний A/B на прод-збірці (2026-09-22): префетч-запитів на заход
  // 8 → 4, час навігації локально не змінився (і так ~17мс на повторі) —
  // ефект на реальному Vercel, де повторна навігація йшла ~1.3с (#68),
  // міряється окремо після деплою саме цього коміту.
  partialPrefetching: true,
  // X-Powered-By: Next.js — палить фреймворк без жодної користі,
  // вимикається одним прапорцем.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: buildCsp() },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // public/guide/install.html — застосунок навмисно показує його в
      // <iframe> (components/InstallGuide.tsx, GUIDE_URL): онбординг у
      // app/register/page.js і повторний перегляд із SettingsSheet. Загальне
      // правило вище (X-Frame-Options: DENY, frame-ancestors 'none') рахує
      // це клікджекінгом і глушить власний iframe застосунку білим екраном
      // — тут дозволяємо фрейм лише з того самого origin, не звідусіль.
      // Пізніший запис у масиві перекриває той самий ключ заголовка для
      // збіжного шляху (Next.js headers() Header Overriding Behavior).
      {
        source: "/guide/:path*",
        headers: [
          { key: "Content-Security-Policy", value: buildCsp({ frameAncestors: "'self'" }) },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  // Файли з public/, які серверний код читає з диска (fs), а не віддає
  // як статику: логотип на PDF-сертифікаті (app/api/courses/[slug]/
  // certificate) і трилисник у PIN-листі (lib/emailTemplates.ts). Шлях там
  // приходить зі змінної (lib/branding.js), тож трасування збірки їх не
  // бачить — а на Vercel у функції нема public/ узагалі (тільки в CDN).
  // Після turbopackIgnore (2026-09-15) сертифікат на проді впав з ENOENT,
  // лист мовчки йшов без логотипа. Явний include — на всі маршрути.
  //
  // app/generated/prisma/** — той самий клас багу (2026-09-19):
  // кастомний output-шлях Prisma-клієнта (schema.prisma generator client)
  // містить query_compiler_fast_bg.wasm (~3.4 МБ) і runtime/*, які
  // Prisma-рантайм підвантажує зсередини СВОГО ЖЕ коду динамічно — те
  // саме, що трасування збірки статично не бачить, як і шлях лого вище.
  // Підозра: на Vercel це проявлялось як P2023 "Value 'ordering' not
  // found in enum 'ComponentType'" при читанні реальних рядків із БД
  // (курс test-hrafika-10-moduliv) — сама схема/дані коректні (перевірено
  // напряму), локальний `next build`+`next start` з тим самим кодом теж
  // не відтворював баг, тож підозра саме на serverless-бандлінг Vercel,
  // не на код.
  outputFileTracingIncludes: {
    "/*": [
      "public/icons/icon-192.png",
      "public/assets/brand/trefoil-solid-green.png",
      "app/generated/prisma/**",
    ],
  },
  // Дозволяє відкривати dev-сервер із телефону в тій самій Wi-Fi мережі
  // (http://192.168.0.231:3000). Без цього Next у dev-режимі блокує
  // cross-origin запити до /_next/* (403) для будь-якого хоста, крім
  // localhost — сторінка (звичайний GET) вантажиться, а JS-бандл ні,
  // тому виглядає ніби "завантажилось, але кнопки не реагують" (React
  // просто не гідратувався). Патерн під весь /24 — щоб не правити
  // конфіг заново, якщо роутер видасть інший IP у тій же підмережі.
  // *.trycloudflare.com — те саме для доступу ЗЗОВНІ домашньої мережі
  // через `cloudflared tunnel --url http://localhost:3000` (безкоштовний
  // quick tunnel без акаунту, див. C:\Users\Pips\tools\cloudflared.exe).
  // Домен щоразу новий і випадковий при кожному запуску тунелю —
  // wildcard, а не конкретний піддомен, щоб не правити конфіг заново.
  allowedDevOrigins: ["192.168.0.231", "192.168.0.*", "*.trycloudflare.com"],
  images: {
    // Фото уроків, завантажені через /admin (кнопка "Обрати фото…"),
    // тепер зберігаються у Vercel Blob (lib/adminSession.js вимагає,
    // app/api/admin/upload/route.js) — без цього next/image (InfoScreen,
    // components/CoursePlayer.jsx) кидає "hostname is not configured"
    // на будь-яке завантажене фото, статичні /assets/… тут ні до чого.
    // upload.wikimedia.org — публічні вільно-ліцензовані фото (Wikimedia
    // Commons), використані для наповнення тестових курсів "Технік
    // розливного обладнання"/"ТП" (RNE104, команда СВ Харків 5). Стабільні
    // прямі URL (не легко "битий" хостинг), без завантаження файлів на
    // наш бік — next/image просто оптимізує їх з чужого хоста.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
    ],
  },
};

export default nextConfig;
