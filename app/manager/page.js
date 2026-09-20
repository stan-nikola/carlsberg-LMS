import { getCurrentUser } from "@/lib/session";
import { getManagerOverview } from "@/lib/managerOverview";
import { ManagerDashboard } from "@/components/ManagerDashboard";

// Дані рахуються тут (Server Component), не в ManagerDashboard.jsx через
// клієнтський fetch — інакше екран щоразу монтувався з порожнім станом і
// власним скелетоном, повз кеш getManagerOverview (аудит "быстродействия
// не почувствовал", 2026-09-19). ManagerGate (app/manager/layout.js) уже
// перевірив сесію/роль вище по дереву.
export default async function ManagerPage() {
  const employee = await getCurrentUser();
  let initialData = null;
  let initialError = false;
  try {
    // Тривіальні власні поля — без похід у базу, тож збираються тут, а не
    // всередині "use cache: private" (getManagerOverview приймає лише
    // employeeId/positionId, див. коментар у lib/managerOverview.js).
    const overview = await getManagerOverview(employee.id, employee.positionId);
    initialData = {
      me: {
        id: employee.id,
        name: employee.name,
        externalCode: employee.externalCode,
        hasEmail: Boolean(employee.email),
        avatarUrl: employee.avatarUrl,
        levelLabel: overview.levelLabel,
        position: employee.position,
        enrollments: overview.enrollments,
      },
      team: overview.team,
    };
  } catch {
    initialError = true;
  }

  return <ManagerDashboard initialData={initialData} initialError={initialError} />;
}
