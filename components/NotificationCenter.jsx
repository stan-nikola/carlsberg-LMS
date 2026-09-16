"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LinesSkeleton } from "@/components/Skeleton";
import { categoryMeta, formatRelativeTime } from "@/lib/notificationTypes";

/**
 * Стрічка сповіщень (центр). Відкрили — усе позначається прочитаним
 * (патерн месенджерів: «побачив список = прочитав»), окремих галочок нема.
 * Спільна для /hub і /manager.
 */
export function NotificationCenter() {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load(after) {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications${after ? `?cursor=${after}` : ""}`);
      const data = await res.json();
      setItems((prev) => (after ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
      if (data.unreadCount > 0) {
        await fetch("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

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
