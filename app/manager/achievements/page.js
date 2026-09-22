import { getCurrentUser } from "@/lib/session";
import { getEmployeeBadgesView, getEmployeeCertificates } from "@/lib/achievements";
import { getEmployeeRating, getLeaderboard } from "@/lib/rating";
import { AchievementsPanel } from "@/components/AchievementsPanel";

// «Досягнення» керівника — та сама панель, що й app/hub/achievements/page.js,
// але лідерборд — уся гілка підпорядкування (усі посади регіону), а не
// лише колеги по посаді: керівнику цікаво, хто в команді попереду.
export default async function ManagerAchievementsPage() {
  const employee = await getCurrentUser();
  const [rating, badges, certificates, leaderboard] = await Promise.all([
    getEmployeeRating(employee),
    getEmployeeBadgesView(employee.id),
    getEmployeeCertificates(employee.id),
    getLeaderboard(employee, "region", 10),
  ]);

  const cohortLabel = employee.position ? `на посаді ${employee.position.code}` : "колег";

  return (
    <div className="manager-page manager-achievements-page">
      <div className="greeting">ВАШ ПРОГРЕС</div>
      <h1 className="hub-h1">Досягнення</h1>
      <AchievementsPanel
        rating={rating}
        badges={badges}
        certificates={certificates}
        leaderboard={leaderboard}
        leaderboardTitle="Лідери вашої команди (% від найкращого у своїй посаді)"
        cohortLabel={cohortLabel}
        currentEmployeeId={employee.id}
        hasEmail={Boolean(employee.email)}
      />
    </div>
  );
}
