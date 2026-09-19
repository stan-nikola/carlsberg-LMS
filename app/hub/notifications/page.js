import { NotificationCenter } from "@/components/NotificationCenter";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function HubNotificationsPage() {
  return (
    <section className="hub-screen">
      <div className="greeting">ОСОБИСТИЙ КАБІНЕТ</div>
      <h1 className="hub-h1">Сповіщення</h1>
      <NotificationCenter />
    </section>
  );
}
