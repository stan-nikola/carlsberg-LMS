import { getCurrentUser } from "@/lib/session";
import { getEmployeeBadgesView, getEmployeeCertificates } from "@/lib/achievements";
import { getEmployeeRating, getTeamLeaderboardByPosition } from "@/lib/rating";
import { AchievementsPanel } from "@/components/AchievementsPanel";

// «Досягнення» керівника — та сама панель, що й app/hub/achievements/page.js,
// але лідерборд — уся гілка підпорядкування, ЗГРУПОВАНА за посадою
// (кожен рейтингується серед своєї посади), і рядки клікабельні — ведуть
// на лист підлеглого. Керівнику важливо бачити, хто на якому місці серед
// таких самих, а не змішаним списком непорівнянних посад.
export default async function ManagerAchievementsPage({ searchParams }) {
  const employee = await getCurrentUser();
  const [rating, badges, certificates, leaderboardGroups] = await Promise.all([
    getEmployeeRating(employee),
    getEmployeeBadgesView(employee.id),
    getEmployeeCertificates(employee.id),
    getTeamLeaderboardByPosition(employee.id),
  ]);

  const cohortLabel = employee.position ? `на посаді ${employee.position.code}` : "колег";
  // ?highlight=rating — з клікабельної картки профілю на /manager
  // (components/ManagerDashboard.jsx). ?highlight=badge&badgeId=N — зі
  // сповіщення "Нова відзнака" (той самий підхід, що й /hub/achievements).
  const sp = await searchParams;
  const highlightRating = sp?.highlight === "rating";
  const highlightBadgeId = sp?.highlight === "badge" ? Number(sp?.badgeId) || null : null;

  return (
    <div className="manager-page manager-achievements-page">
      <h1 className="greeting hub-greeting-h1">ВАШ ПРОГРЕС</h1>
      <AchievementsPanel
        rating={rating}
        badges={badges}
        certificates={certificates}
        leaderboard={[]}
        leaderboardGroups={leaderboardGroups}
        leaderHref={(id) => `/manager/team/${id}`}
        leaderboardTitle="Лідери команди за посадами (% від найкращого у своїй посаді)"
        cohortLabel={cohortLabel}
        currentEmployeeId={employee.id}
        hasEmail={Boolean(employee.email)}
        highlightRating={highlightRating}
        highlightBadgeId={highlightBadgeId}
      />
    </div>
  );
}
