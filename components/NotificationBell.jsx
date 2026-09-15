"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@/components/icons";

/**
 * Дзвіночок з лічильником непрочитаних. Опитує /api/notifications раз на
 * хвилину і при поверненні на вкладку — без WebSocket/SSE: Vercel
 * serverless їх не тримає, а хвилинна затримка для «прийшов курс» — ок;
 * push і так приходить миттєво. ponytail: polling; SSE — якщо колись
 * буде потрібна секундна свіжість.
 */
export function NotificationBell({ href }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setUnread(d.unreadCount))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    // Push прийшов, поки застосунок відкритий — service worker шле message
    // (public/sw.js), лічильник оновлюється миттєво.
    const onSwMessage = (e) => e.data?.type === "push" && load();
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  return (
    <Link className="iconbtn ntf-bell" href={href} aria-label={unread ? `Сповіщення, непрочитаних: ${unread}` : "Сповіщення"}>
      <BellIcon />
      {unread > 0 && <span className="ntf-bell-count">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}
