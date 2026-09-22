import { getCurrentUser } from "@/lib/session";
import { getManagerOverview } from "@/lib/managerOverview";
import { ManagerDashboard } from "@/components/ManagerDashboard";

// TODO: Cache Components adoption. Той самий опт-аут, що вже стоїть на
// app/hub/page.js (2026-09-22): без нього /hub ловив "uncached data during
// render" і в dev іноді лишав ОБИДВА дерева (Suspense-фолбек і реальний
// контент) змонтованими одночасно — той самий клас маршруту (Server
// Component з getCurrentUser()/сесією), тож про всяк випадок і тут.
export const instant = false;

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
