import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { computeXp } from "@/lib/progress";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileDetailPanel } from "@/components/ProfileDetailPanel";

// "Профіль" керівника — той самий ProfileCard + ProfileDetailPanel, що й
// app/hub/profile/page.js. Керівник теж має managerId вгору по ієрархії
// (RM HoReCa — виняток, managerId null, тоді "Керівник (email)" — "—").
export default async function ManagerProfilePage() {
  const sessionUser = await getCurrentUser();
  const employee = await prisma.employee.findUnique({
    where: { id: sessionUser.id },
    include: { manager: true },
  });
  const enrollments = await getEmployeeEnrollments(employee.id);
  const { levelLabel } = computeXp(enrollments);

  return (
    <div className="manager-page manager-hub-page">
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
    </div>
  );
}
