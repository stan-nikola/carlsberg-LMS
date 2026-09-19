"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@/components/icons";

/**
 * Дзвіночок з лічильником непрочитаних. Опитує /api/notifications раз на
 * хвилину і при поверненні на вкладку — без WebSocket/SSE: Vercel
 * serverless їх не тримає, а хвилинна затримка для «прийшов курс» — ок;
 * push і так приходить миттєво. ponytail: polling; SSE — якщо колись
 * буде потрібна секундна свіжість.
 *
 * Дзвоник "трясеться" (.is-ringing, app/styles/notifications.css), коли
 * непрочитаних стало БІЛЬШЕ, ніж на попередньому опитуванні (запит
 * користувача, 2026-09-19) — не просто "unread > 0" (інакше трясло б на
 * кожному монтуванні/переході між сторінками, поки лічильник не
 * прочитано). Перший-у-сесії fetch лише запам'ятовує стартове значення,
 * не трясе — немає "попереднього", з чим порівнювати.
 */
export function NotificationBell({ href }) {
  const [unread, setUnread] = useState(0);
  const [ringing, setRinging] = useState(false);
  const prevUnreadRef = useRef(null);
  const ringTimeoutRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d) return;
          const next = d.unreadCount;
          if (prevUnreadRef.current != null && next > prevUnreadRef.current) {
            setRinging(true);
            clearTimeout(ringTimeoutRef.current);
            ringTimeoutRef.current = setTimeout(() => alive && setRinging(false), 720);
          }
          prevUnreadRef.current = next;
          setUnread(next);
        })
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
      clearTimeout(ringTimeoutRef.current);
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  return (
    <Link
      className={`iconbtn ntf-bell${ringing ? " is-ringing" : ""}`}
      href={href}
      aria-label={unread ? `Сповіщення, непрочитаних: ${unread}` : "Сповіщення"}
    >
      <BellIcon />
      {unread > 0 && <span className="ntf-bell-count">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}
