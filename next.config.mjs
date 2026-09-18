/** @type {import('next').NextConfig} */
const nextConfig = {
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
