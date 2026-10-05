"use client";

import { useEffect } from "react";

// Помилка у самому кореневому layout: Next замінює весь документ цим файлом,
// тож глобальні стилі, шрифти й токени сюди не доходять — стилі inline, шрифт
// системний, кольори фірмові (#00321e). Тема за налаштуванням ОС.
type ErrorProps = {
  error: Error & { digest?: string };
  retry?: () => void;
  unstable_retry?: () => void;
  reset?: () => void;
};

export default function GlobalError({ error, retry, unstable_retry, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const again = retry ?? unstable_retry ?? reset;

  return (
    <html lang="uk">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#f3f7f4",
          color: "#0f1f17",
        }}
      >
        <main role="alert" style={{ maxWidth: 420, width: "100%", textAlign: "center", background: "#fff", border: "1px solid #dde6e0", padding: "32px 24px" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#00321e" }}>Щось пішло не так</h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.5, color: "#5b6b64" }}>
            Застосунок не завантажився. Спробуйте ще раз — найчастіше це тимчасова помилка зв’язку.
          </p>
          <button
            type="button"
            onClick={() => again?.()}
            style={{ width: "100%", minHeight: 48, border: "none", background: "#00321e", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            Спробувати ще раз
          </button>
          {error?.digest && <p style={{ margin: "12px 0 0", fontSize: 11, color: "#5b6b64", wordBreak: "break-all" }}>Код помилки: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
