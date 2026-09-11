import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { AchievementsPanel } from "@/components/AchievementsPanel";

// "Досягнення" керівника — та сама панель, що й app/hub/achievements/page.js
// (components/AchievementsPanel.jsx), рахована по власних enrollments
// керівника.
export default async function ManagerAchievementsPage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);
  const passedCount = enrollments.filter((e) => e.status === "completed" && e.passed).length;

  return (
    <div className="manager-page manager-hub-page">
      <div className="greeting">ВАШ ПРОГРЕС</div>
      <h1 className="hub-h1">Досягнення</h1>
      <AchievementsPanel passedCount={passedCount} />
    </div>
  );
}
