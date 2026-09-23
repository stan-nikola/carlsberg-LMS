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
      <h1 className="greeting hub-greeting-h1">КАБІНЕТ КЕРІВНИКА</h1>
      {/* managerMode — старі сповіщення в базі ведуть у /hub/..., що для
          керівника означає редірект на голий /manager; центр підміняє
          адресу на відповідну в кабінеті (lib/notificationTypes.ts). */}
      <NotificationCenter initialItems={feed.items} initialCursor={feed.nextCursor} initialUnreadCount={feed.unreadCount} managerMode />
    </div>
  );
}
