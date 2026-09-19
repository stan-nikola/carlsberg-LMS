import { getCurrentUser } from "@/lib/session";
import { getEmployeeRating } from "@/lib/rating";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileDetailPanel } from "@/components/ProfileDetailPanel";
import { NotificationSettings } from "@/components/NotificationSettings";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// "Профіль" керівника — той самий ProfileCard + ProfileDetailPanel, що й
// app/hub/profile/page.js. Керівник теж має managerId вгору по ієрархії
// (RM HoReCa — виняток, managerId null, тоді "Керівник (email)" — "—").
export default async function ManagerProfilePage() {
  // getCurrentUser() уже включає manager (lib/session.js, аудит швидкодії
  // 2026-09-19) — окремий другий findUnique за тим самим employeeId
  // тут більше не потрібен.
  const employee = await getCurrentUser();
  const { level } = await getEmployeeRating(employee);
  const levelLabel = level.label;

  return (
    // Mobile-first: один стовпчик; від 900px — дві колонки (картка + дані
    // зліва, сповіщення справа), див. .mgr-profile у manager.css.
    <div className="manager-page manager-profile-page">
      <div className="greeting">ОСОБИСТИЙ КАБІНЕТ</div>
      <h1 className="hub-h1">Профіль</h1>

      <div className="mgr-profile">
        <div className="mgr-profile-main">
          <ProfileCard
            dbName={employee.name}
            hasEmail={Boolean(employee.email)}
            externalCode={employee.externalCode}
            levelLabel={levelLabel}
            avatarUrl={employee.avatarUrl}
            editable
          />
          <div className="hub-sec-title">
            <h3>Дані</h3>
          </div>
          <ProfileDetailPanel
            externalCode={employee.externalCode}
            managerEmail={employee.manager?.email}
            firstLoginAt={employee.firstLoginAt}
          />
        </div>
        <div className="mgr-profile-side">
          <div className="hub-sec-title">
            <h3>Сповіщення</h3>
          </div>
          <NotificationSettings />
        </div>
      </div>
    </div>
  );
}
