import { getCurrentUser } from "@/lib/session";
import { getEmployeeRating } from "@/lib/rating";
import { ProfileCard } from "@/components/hub/ProfileCard";
import { ProfileDetailPanel } from "@/components/hub/ProfileDetailPanel";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";

// Портовано з .hub-screen[data-tab="profile"] в legacy index.html.
// pdSvEmail ("Керівник (email)") тепер employee.manager.email замість
// плаского profile.svEmail; pdRegisteredAt — employee.firstLoginAt
// замість profile.registeredAt. Рядки деталей — components/hub/ProfileDetailPanel.jsx,
// той самий блок рендерить і /manager/profile.
export default async function HubProfilePage({ searchParams }) {
  // getCurrentUser() уже включає manager (lib/session.js, аудит швидкодії
  // 2026-09-19) — окремий другий findUnique за тим самим employeeId
  // тут більше не потрібен.
  const employee = await getCurrentUser();
  // Гостя переадресує лейаут (паралельно зі сторінкою) — тут лише не падаємо.
  if (!employee) return null;
  const { level } = await getEmployeeRating(employee);
  const levelLabel = level.label;
  // ?highlight=notifications — прийшли з картки «Налаштуйте сповіщення» на
  // головній (components/notifications/NotificationSettings.jsx variant="card").
  const highlightNotifications = (await searchParams)?.highlight === "notifications";

  return (
    <section className="hub-screen">
      <h1 className="greeting hub-greeting-h1">ПРОФІЛЬ</h1>

      <ProfileCard
        dbName={employee.name}
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
