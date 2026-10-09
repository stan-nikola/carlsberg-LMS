import { getCurrentUser } from "@/lib/session";
import { getEmployeeBadgesView, getEmployeeCertificates } from "@/lib/achievements";
import { getEmployeeRating, getLeaderboard } from "@/lib/rating";
import { AchievementsPanel } from "@/components/hub/AchievementsPanel";

// «Досягнення» співробітника: рейтинг + відзнаки + сертифікати + лідери
// когорти (та сама посада). Сам вміст — components/hub/AchievementsPanel.jsx,
// той самий блок рендерить і /manager/achievements (з когортою «команда»).
export default async function HubAchievementsPage({ searchParams }) {
  const employee = await getCurrentUser();
  // Гостя переадресує лейаут (паралельно зі сторінкою) — тут лише не падаємо.
  if (!employee) return null;
  const [rating, badges, certificates, leaderboard] = await Promise.all([
    getEmployeeRating(employee),
    getEmployeeBadgesView(employee.id),
    getEmployeeCertificates(employee.id),
    getLeaderboard(employee, "position"),
  ]);
  // ?highlight=rating — прийшли з клікабельної зеленої картки на Home
  // (components/hub/ProfileCard.jsx). ?highlight=badge&badgeId=N — зі
  // сповіщення "Нова відзнака" (lib/notifications.js notifyBadgeAwarded).
  const sp = await searchParams;
  const highlightRating = sp?.highlight === "rating";
  const highlightBadgeId = sp?.highlight === "badge" ? Number(sp?.badgeId) || null : null;

  return (
    <section className="hub-screen">
      <h1 className="greeting hub-greeting-h1">МІЙ ПРОГРЕС</h1>
      <AchievementsPanel
        rating={rating}
        badges={badges}
        certificates={certificates}
        leaderboard={leaderboard}
        leaderboardTitle={employee.position ? `Лідери серед ${employee.position.code}` : "Лідери"}
        cohortLabel={employee.position ? `на посаді ${employee.position.code}` : "колег"}
        currentEmployeeId={employee.id}
        highlightRating={highlightRating}
        highlightBadgeId={highlightBadgeId}
      />
    </section>
  );
}
