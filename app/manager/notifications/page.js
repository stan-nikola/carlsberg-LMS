import { getCurrentUser } from "@/lib/session";
import { getNotificationFeed } from "@/lib/notificationFeed";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

// Server Component + кешована стрічка (lib/notificationFeed.ts) замість
// клієнтського fetch() на монтуванні NotificationCenter.tsx — той самий
// фікс, що вже застосований до /manager (аудит "вообще без скелетонов
// мгновенно", 2026-09-20).
export default async function ManagerNotificationsPage({ searchParams }) {
  const employee = await getCurrentUser();
  // Гостя переадресує лейаут (паралельно зі сторінкою) — тут лише не падаємо.
  if (!employee) return null;
  const feed = await getNotificationFeed(employee.id);
  // ?highlight=<id> — прийшли з push/Telegram (lib/notifications.js notifyEmployees).
  const highlightId = Number((await searchParams)?.highlight) || null;

  return (
    <div className="manager-page manager-notifications-page">
      <h1 className="greeting hub-greeting-h1">СПОВІЩЕННЯ</h1>
      {/* managerMode — старі сповіщення в базі ведуть у /hub/..., що для
          керівника означає редірект на голий /manager; центр підміняє
          адресу на відповідну в кабінеті (lib/notificationTypes.ts). */}
      <NotificationCenter initialItems={feed.items} initialCursor={feed.nextCursor} initialUnreadCount={feed.unreadCount} managerMode highlightId={highlightId} />
    </div>
  );
}
