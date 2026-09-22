import { getCurrentUser } from "@/lib/session";
import { getNotificationFeed } from "@/lib/notificationFeed";
import { NotificationCenter } from "@/components/NotificationCenter";

// Server Component + кешована стрічка (lib/notificationFeed.js) замість
// клієнтського fetch() на монтуванні NotificationCenter.jsx — той самий
// фікс, що вже застосований до /manager (аудит "вообще без скелетонов
// мгновенно", 2026-09-20).
export default async function ManagerNotificationsPage() {
  const employee = await getCurrentUser();
  const feed = await getNotificationFeed(employee.id);

  return (
    <div className="manager-page manager-notifications-page">
      <div className="greeting">КАБІНЕТ КЕРІВНИКА</div>
      <h1 className="hub-h1">Сповіщення</h1>
      <NotificationCenter initialItems={feed.items} initialCursor={feed.nextCursor} initialUnreadCount={feed.unreadCount} />
    </div>
  );
}
