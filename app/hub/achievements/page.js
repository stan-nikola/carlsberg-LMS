import { getCurrentUser } from "@/lib/session";
import { getEmployeeBadgesView, getEmployeeCertificates } from "@/lib/achievements";
import { getEmployeeRating, getLeaderboard } from "@/lib/rating";
import { AchievementsPanel } from "@/components/AchievementsPanel";

// «Досягнення» співробітника: рейтинг + відзнаки + сертифікати + лідери
// когорти (та сама посада). Сам вміст — components/AchievementsPanel.jsx,
// той самий блок рендерить і /manager/achievements (з когортою «команда»).
export default async function HubAchievementsPage() {
  const employee = await getCurrentUser();
  const [rating, badges, certificates, leaderboard] = await Promise.all([
    getEmployeeRating(employee),
    getEmployeeBadgesView(employee.id),
    getEmployeeCertificates(employee.id),
    getLeaderboard(employee, "position"),
  ]);

  return (
    <section className="hub-screen">
      <div className="greeting">ВАШ ПРОГРЕС</div>
      <h1 className="hub-h1">Досягнення</h1>
      <AchievementsPanel
        rating={rating}
        badges={badges}
        certificates={certificates}
        leaderboard={leaderboard}
        leaderboardTitle={employee.position ? `Лідери серед ${employee.position.code}` : "Лідери"}
        cohortLabel={employee.position ? `на посаді ${employee.position.code}` : "колег"}
        currentEmployeeId={employee.id}
        hasEmail={Boolean(employee.email)}
      />
    </section>
  );
}
