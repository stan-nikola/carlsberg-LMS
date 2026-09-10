"use client";

import { useEffect } from "react";

/**
 * Реєструє public/sw.js (мінімальний, без кешування — див. коментар там)
 * лише щоб Chrome вважав застосунок "installable" для повноцінного PWA
 * при "Додати на головний екран". Нічого не рендерить.
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
