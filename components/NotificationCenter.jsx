"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LinesSkeleton } from "@/components/Skeleton";
import { categoryMeta, formatRelativeTime } from "@/lib/notificationTypes";

/**
 * Стрічка сповіщень (центр). Відкрили — усе позначається прочитаним
 * (патерн месенджерів: «побачив список = прочитав»), окремих галочок нема.
 * Спільна для /hub і /manager.
 *
 * Перша сторінка приходить ГОТОВОЮ з сервера (app/manager/notifications/
 * page.js, app/hub/notifications/page.js — lib/notificationFeed.js,
 * "use cache: private") — раніше цей компонент сам ходив у fetch() на
 * кожному монтуванні, повз клієнтський Router Cache (той самий баг-клас,
 * що вже виправлений для /manager, аудит "вообще без скелетонов
 * мгновенно", 2026-09-20). load(after) лишається клієнтським — це
 * пагінація "Показати ще" по кліку, не первинне завантаження.
 *
 * @param {{ initialItems?: any[], initialCursor?: number | null, initialUnreadCount?: number }} props
 */
export function NotificationCenter({ initialItems = [], initialCursor = null, initialUnreadCount = 0 }) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  // Синхронізація з новими пропсами ПІД ЧАС рендеру (не в ефекті) —
  // той самий патерн, що вже в ManagerDashboard.jsx: після pull-to-
  // refresh сервер віддає нові initialItems/initialCursor, і useState
  // ігнорує зміну початкового значення на повторних рендерах без цього.
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
    setCursor(initialCursor);
  }

  async function load(after) {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications${after ? `?cursor=${after}` : ""}`);
      const data = await res.json();
      setItems((prev) => (after ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  // "Побачив список = прочитав" — мутація, не частина кешованого читання,
  // тож лишається окремим client-side POST. Залежність саме на
  // initialUnreadCount (примітив із пропсів), не ref-прапорець: спрацює
  // знову й після pull-to-refresh, якщо прийшли нові непрочитані.
  useEffect(() => {
    if (initialUnreadCount === 0) return;
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }, [initialUnreadCount]);

  if (!loading && items.length === 0) return <p className="hub-empty-note">Поки що жодного сповіщення.</p>;

  return (
    <div className="ntf-list">
      {items.map((n) => {
        const meta = categoryMeta(n.category);
        const body = (
          <>
            <span className="ntf-ico" aria-hidden="true">
              {meta.icon}
            </span>
            <span className="ntf-body">
              {n.title && <b className="ntf-title">{n.title}</b>}
              <span className="ntf-msg">{n.message}</span>
              <span className="ntf-time">{formatRelativeTime(n.createdAt)}</span>
            </span>
          </>
        );
        const cls = `ntf-item${n.isRead ? "" : " unread"}`;
        return n.url ? (
          <Link key={n.id} href={n.url} className={cls}>
            {body}
          </Link>
        ) : (
          <div key={n.id} className={cls}>
            {body}
          </div>
        );
      })}
      {loading && <LinesSkeleton rows={items.length ? 2 : 5} />}
      {cursor && !loading && (
        <button type="button" className="btn-secondary-full" onClick={() => load(cursor)}>
          Показати ще
        </button>
      )}
    </div>
  );
}
