"use client";

import { useEffect, useState } from "react";

/**
 * Свіжий ключ для посилання на Excel-звіт (lib/exportLink.ts, живе 10 хв):
 * береться при відкритті дашборда, при поверненні на вкладку і раз на 5 хв,
 * поки вкладка видима — посилання має бути готове ДО тапу, бо вікно з
 * «Готово» на iPhone відкриває сам браузер по href, без нашого коду між
 * тапом і запитом. Запит легкий — лише підпис, без бази.
 */
export function useExportLinkToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/manager/export/link", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d?.token && setToken(d.token))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return token;
}
