import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Сторінку не знайдено" };

// 404 для всього застосунку: і notFound() у роутах (курс не знайдено, чужий
// підлеглий), і адреса, якої нема. «На головну» веде на «/», а там
// app/page.js сам розводить за роллю: нема сесії — /register, керівник —
// /manager, решта — /hub.
export default function NotFound() {
  return (
    <main className="sp-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- статичний значок із public, оптимізація зайва */}
      <img className="sp-logo" src="/icons/icon-192.png" alt="" width={56} height={56} />
      <p className="sp-code" aria-hidden="true">404</p>
      <h1 className="sp-title">Сторінку не знайдено</h1>
      <p className="sp-text">Можливо, посилання застаріло або курс більше не доступний. Перевірте адресу або поверніться на головну.</p>
      <div className="sp-actions">
        <Link href="/" className="btn-primary-full">
          На головну
        </Link>
      </div>
    </main>
  );
}
