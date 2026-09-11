import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { AchievementsPanel } from "@/components/AchievementsPanel";

// Портовано з .hub-screen[data-tab="achievements"] в legacy index.html.
// Значки й рейтинг лишились здебільшого захардкодженими заглушками, як і
// в legacy — реальна логіка є лише для "Курс складено" (badgeCourseDone).
// Сам вміст (значки+рейтинг) — components/AchievementsPanel.jsx, той
// самий блок рендерить і /manager/achievements.
export default async function HubAchievementsPage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);
  const passedCount = enrollments.filter((e) => e.status === "completed" && e.passed).length;

  return (
    <section className="hub-screen">
      <div className="greeting">ВАШ ПРОГРЕС</div>
      <h1 className="hub-h1">Досягнення</h1>
      <AchievementsPanel passedCount={passedCount} />
    </section>
  );
}
