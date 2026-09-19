import { getCurrentUser } from "@/lib/session";
import { getEmployeeBadgesView, getEmployeeCertificates } from "@/lib/achievements";
import { getEmployeeRating, getLeaderboard } from "@/lib/rating";
import { AchievementsPanel } from "@/components/AchievementsPanel";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
        cohortLabel={employee.position ? `на посаді ${employee.position.code}` : "колег"}
        currentEmployeeId={employee.id}
        hasEmail={Boolean(employee.email)}
      />
    </div>
  );
}
