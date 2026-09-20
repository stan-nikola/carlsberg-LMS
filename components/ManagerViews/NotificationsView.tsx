"use client";

import { useViewData } from "@/components/useViewData";
import { NotificationCenter } from "@/components/NotificationCenter";
import { PageSkeleton } from "@/components/Skeleton";

type NotificationsData = { items: any[]; nextCursor: number | null; unreadCount: number };

async function fetchNotifications(): Promise<NotificationsData> {
  const res = await fetch("/api/notifications");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

// Той самий вміст, що app/manager/notifications/page.js — клієнтська
// версія для перемикання вкладки без реальної Next.js-навігації
// (ManagerShell.jsx).
export function NotificationsView() {
  const { data, loading, error } = useViewData("/manager/notifications", fetchNotifications);

  if (loading) {
    return (
      <div className="manager-page manager-notifications-page">
        <PageSkeleton />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="manager-page manager-notifications-page">
        <p className="admin-hint">Не вдалося завантажити сповіщення. Спробуйте оновити сторінку.</p>
      </div>
    );
  }

  return (
    <div className="manager-page manager-notifications-page">
      <div className="greeting">КАБІНЕТ КЕРІВНИКА</div>
      <h1 className="hub-h1">Сповіщення</h1>
      <NotificationCenter initialItems={data.items} initialCursor={data.nextCursor} initialUnreadCount={data.unreadCount} />
    </div>
  );
}
