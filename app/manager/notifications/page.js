import { NotificationCenter } from "@/components/NotificationCenter";

export default function ManagerNotificationsPage() {
  return (
    <div className="manager-page manager-hub-page">
      <div className="greeting">КАБІНЕТ КЕРІВНИКА</div>
      <h1 className="hub-h1">Сповіщення</h1>
      <NotificationCenter />
    </div>
  );
}
