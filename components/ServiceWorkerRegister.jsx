"use client";

import { useEffect } from "react";

/**
 * Реєструє public/sw.js: installability для PWA, Web Push і офлайн-кеш
 * (network-first, див. коментар там). Нічого не рендерить.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Не критично — застосунок і без SW працює, просто без
        // "трастового" WebAPK-встановлення.
      });
    }
  }, []);

  return null;
}
