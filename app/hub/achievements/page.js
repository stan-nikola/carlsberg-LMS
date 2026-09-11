import { getCurrentUser } from "@/lib/session";
import { getEmployeeBadgesView, getTerritoryLeaderboard } from "@/lib/achievements";
import { AchievementsPanel } from "@/components/AchievementsPanel";

// Портовано з .hub-screen[data-tab="achievements"] в legacy index.html.
// Раніше значки й рейтинг були захардкодженими заглушками (Фаза C
// адмінки замінила це на реальні дані — lib/achievements.js). Сам вміст
// (значки+рейтинг) — components/AchievementsPanel.jsx, той самий блок
// рендерить і /manager/achievements.
export default async function HubAchievementsPage() {
  const employee = await getCurrentUser();
  const [badges, leaderboard] = await Promise.all([
    getEmployeeBadgesView(employee.id),
    getTerritoryLeaderboard(employee.territoryId),
  ]);

  return (
    <section className="hub-screen">
      <div className="greeting">ВАШ ПРОГРЕС</div>
      <h1 className="hub-h1">Досягнення</h1>
      <AchievementsPanel badges={badges} leaderboard={leaderboard} currentEmployeeId={employee.id} />
    </section>
  );
}
