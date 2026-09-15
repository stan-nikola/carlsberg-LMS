import { NotificationCenter } from "@/components/NotificationCenter";

export default function HubNotificationsPage() {
  return (
    <section className="hub-screen">
      <div className="greeting">ОСОБИСТИЙ КАБІНЕТ</div>
      <h1 className="hub-h1">Сповіщення</h1>
      <NotificationCenter />
    </section>
  );
}
