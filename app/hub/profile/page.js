import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { computeXp } from "@/lib/progress";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileDetailPanel } from "@/components/ProfileDetailPanel";

// Портовано з .hub-screen[data-tab="profile"] в legacy index.html.
// pdSvEmail ("Керівник (email)") тепер employee.manager.email замість
// плаского profile.svEmail; pdRegisteredAt — employee.firstLoginAt
// замість profile.registeredAt. Рядки деталей — components/ProfileDetailPanel.jsx,
// той самий блок рендерить і /manager/profile.
export default async function HubProfilePage() {
  const sessionUser = await getCurrentUser();
  const employee = await prisma.employee.findUnique({
    where: { id: sessionUser.id },
    include: { manager: true },
  });
  const enrollments = await getEmployeeEnrollments(employee.id);
  const { levelLabel } = computeXp(enrollments);

  return (
    <section className="hub-screen">
      <div className="greeting">ОСОБИСТИЙ КАБІНЕТ</div>
      <h1 className="hub-h1">Профіль</h1>

      <ProfileCard
        dbName={employee.name}
        hasEmail={Boolean(employee.email)}
        externalCode={employee.externalCode}
        levelLabel={levelLabel}
      />

      <ProfileDetailPanel
        externalCode={employee.externalCode}
        managerEmail={employee.manager?.email}
        firstLoginAt={employee.firstLoginAt}
      />
    </section>
  );
}
