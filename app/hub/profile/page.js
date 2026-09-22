import { getCurrentUser } from "@/lib/session";
import { getEmployeeRating } from "@/lib/rating";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileDetailPanel } from "@/components/ProfileDetailPanel";
import { NotificationSettings } from "@/components/NotificationSettings";

// Портовано з .hub-screen[data-tab="profile"] в legacy index.html.
// pdSvEmail ("Керівник (email)") тепер employee.manager.email замість
// плаского profile.svEmail; pdRegisteredAt — employee.firstLoginAt
// замість profile.registeredAt. Рядки деталей — components/ProfileDetailPanel.jsx,
// той самий блок рендерить і /manager/profile.
export default async function HubProfilePage({ searchParams }) {
  // getCurrentUser() уже включає manager (lib/session.js, аудит швидкодії
  // 2026-09-19) — окремий другий findUnique за тим самим employeeId
  // тут більше не потрібен.
  const employee = await getCurrentUser();
  const { level } = await getEmployeeRating(employee);
  const levelLabel = level.label;
  // ?highlight=notifications — прийшли з картки «Налаштуйте сповіщення» на
  // головній (components/NotificationSettings.jsx variant="card").
  const highlightNotifications = (await searchParams)?.highlight === "notifications";

  return (
    <section className="hub-screen">
      <h1 className="greeting hub-greeting-h1">ПРОФІЛЬ</h1>

      <ProfileCard
        dbName={employee.name}
        hasEmail={Boolean(employee.email)}
        levelLabel={levelLabel}
        avatarUrl={employee.avatarUrl}
        editable
      />

      <ProfileDetailPanel
        externalCode={employee.externalCode}
        managerEmail={employee.manager?.email}
        firstLoginAt={employee.firstLoginAt}
      />

      <NotificationSettings highlighted={highlightNotifications} />
    </section>
  );
}
