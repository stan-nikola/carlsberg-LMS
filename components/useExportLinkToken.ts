"use client";

import { useEffect, useState } from "react";

/**
 * Свіжий ключ для посилання на Excel-звіт (lib/exportLink.ts, живе 10 хв):
 * береться при відкритті дашборда, при поверненні на вкладку і раз на 5 хв,
 * поки вкладка видима — посилання має бути готове ДО тапу, бо вікно з
 * «Готово» на iPhone відкриває сам браузер по href, без нашого коду між
 * тапом і запитом. Запит легкий — лише підпис, без бази.
 */
/**
 * Повертає готовий хвіст адреси для посилання: `&t=…` (і `&inline=1` на
 * iPhone/iPad — див. app/api/manager/export/route.ts) або "" поки ключа нема.
 * Платформа визначається лише в ефекті — у серверному рендері navigator нема,
 * і різний href на сервері й клієнті зламав би гідратацію.
 */
export function useExportLinkQuery(): string {
  const [token, setToken] = useState<string | null>(null);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);
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
  return token ? `&t=${encodeURIComponent(token)}${ios ? "&inline=1" : ""}` : "";
}
