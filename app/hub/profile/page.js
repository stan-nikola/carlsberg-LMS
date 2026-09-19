import { getCurrentUser } from "@/lib/session";
import { getEmployeeRating } from "@/lib/rating";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileDetailPanel } from "@/components/ProfileDetailPanel";
import { NotificationSettings } from "@/components/NotificationSettings";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Портовано з .hub-screen[data-tab="profile"] в legacy index.html.
// pdSvEmail ("Керівник (email)") тепер employee.manager.email замість
// плаского profile.svEmail; pdRegisteredAt — employee.firstLoginAt
// замість profile.registeredAt. Рядки деталей — components/ProfileDetailPanel.jsx,
// той самий блок рендерить і /manager/profile.
export default async function HubProfilePage() {
  // getCurrentUser() уже включає manager (lib/session.js, аудит швидкодії
  // 2026-09-19) — окремий другий findUnique за тим самим employeeId
  // тут більше не потрібен.
  const employee = await getCurrentUser();
  const { level } = await getEmployeeRating(employee);
  const levelLabel = level.label;

  return (
    <section className="hub-screen">
      <div className="greeting">ОСОБИСТИЙ КАБІНЕТ</div>
      <h1 className="hub-h1">Профіль</h1>

      <ProfileCard
        dbName={employee.name}
        hasEmail={Boolean(employee.email)}
        externalCode={employee.externalCode}
        levelLabel={levelLabel}
        avatarUrl={employee.avatarUrl}
        editable
      />

      <ProfileDetailPanel
        externalCode={employee.externalCode}
        managerEmail={employee.manager?.email}
        firstLoginAt={employee.firstLoginAt}
      />

      <NotificationSettings />
    </section>
  );
}
