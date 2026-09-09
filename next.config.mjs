/** @type {import('next').NextConfig} */
const nextConfig = {
  // Дозволяє відкривати dev-сервер із телефону в тій самій Wi-Fi мережі
  // (http://192.168.0.231:3000). Без цього Next у dev-режимі блокує
  // cross-origin запити до /_next/* (403) для будь-якого хоста, крім
  // localhost — сторінка (звичайний GET) вантажиться, а JS-бандл ні,
  // тому виглядає ніби "завантажилось, але кнопки не реагують" (React
  // просто не гідратувався). Патерн під весь /24 — щоб не правити
  // конфіг заново, якщо роутер видасть інший IP у тій же підмережі.
  allowedDevOrigins: ["192.168.0.231", "192.168.0.*"],
  images: {
    // Фото уроків, завантажені через /admin (кнопка "Обрати фото…"),
    // тепер зберігаються у Vercel Blob (lib/adminSession.js вимагає,
    // app/api/admin/upload/route.js) — без цього next/image (InfoScreen,
    // components/CoursePlayer.jsx) кидає "hostname is not configured"
    // на будь-яке завантажене фото, статичні /assets/… тут ні до чого.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
