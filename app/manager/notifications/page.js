import { NotificationCenter } from "@/components/NotificationCenter";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function ManagerNotificationsPage() {
  return (
    <div className="manager-page manager-notifications-page">
      <div className="greeting">КАБІНЕТ КЕРІВНИКА</div>
      <h1 className="hub-h1">Сповіщення</h1>
      <NotificationCenter />
    </div>
  );
}
