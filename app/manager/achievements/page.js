import { getCurrentUser } from "@/lib/session";
import { getEmployeeBadgesView, getTerritoryLeaderboard } from "@/lib/achievements";
import { AchievementsPanel } from "@/components/AchievementsPanel";

// "Досягнення" керівника — та сама панель, що й app/hub/achievements/page.js
// (components/AchievementsPanel.jsx), рахована по власних даних керівника.
export default async function ManagerAchievementsPage() {
  const employee = await getCurrentUser();
  const [badges, leaderboard] = await Promise.all([
    getEmployeeBadgesView(employee.id),
    getTerritoryLeaderboard(employee.territoryId),
  ]);

  return (
    <div className="manager-page manager-hub-page">
      <div className="greeting">ВАШ ПРОГРЕС</div>
      <h1 className="hub-h1">Досягнення</h1>
      <AchievementsPanel badges={badges} leaderboard={leaderboard} currentEmployeeId={employee.id} />
    </div>
  );
}
