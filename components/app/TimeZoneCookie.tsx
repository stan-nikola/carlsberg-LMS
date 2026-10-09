"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { UKRAINE_TZ } from "@/lib/ukraineTime";

/**
 * Передає серверу часовий пояс пристрою (cookie tz): рядки з датами, які
 * складає сервер (план курсу, список команди), показуються в часі людини.
 * Перший захід з-за кордону вже відрендерено за українським часом — тоді
 * сторінку оновлюємо один раз.
 */
export function TimeZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    const current = document.cookie.match(/(?:^|;\s*)tz=([^;]*)/)?.[1];
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie = `tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    if (zone !== UKRAINE_TZ) router.refresh();
  }, [router]);
  return null;
}
