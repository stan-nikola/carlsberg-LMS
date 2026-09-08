import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { LockIcon } from "@/components/icons";

// Портовано з .hub-screen[data-tab="achievements"] в legacy index.html.
// Значки й рейтинг лишились здебільшого захардкодженими заглушками, як і
// в legacy — реальна логіка є лише для "Курс складено" (badgeCourseDone).
export default async function HubAchievementsPage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);
  const passedCount = enrollments.filter((e) => e.status === "completed" && e.passed).length;

  return (
    <section className="hub-screen">
      <div className="greeting">ВАШ ПРОГРЕС</div>
      <h1 className="hub-h1">Досягнення</h1>

      <div className="hub-sec-title">
        <h3>Значки</h3>
      </div>
      <div className="badge-grid">
        <div className="badge-item">
          <div className="badge-ico">🎉</div>
          <span>Перший вхід</span>
        </div>
        <div className={`badge-item${passedCount > 0 ? "" : " locked"}`}>
          <div className="badge-ico">🏆</div>
          <span>Курс складено</span>
        </div>
        <div className="badge-item locked">
          <div className="badge-ico">🎯</div>
          <span>Без помилок</span>
        </div>
        <div className="badge-item locked">
          <div className="badge-ico">🔥</div>
          <span>Серія з 3 днів</span>
        </div>
        <div className="badge-item locked">
          <div className="badge-ico">📚</div>
          <span>5 курсів пройдено</span>
        </div>
        <div className="badge-item locked">
          <div className="badge-ico">⭐</div>
          <span>Топ регіону</span>
        </div>
      </div>

      <div className="hub-sec-title">
        <h3>Рейтинг регіону</h3>
      </div>
      <div className="leaderboard-wrap">
        <div className="leaderboard-list">
          <div className="lb-row">
            <span className="lb-rank">1</span>
            <span className="lb-name">Ірина П.</span>
            <span className="lb-score">980 XP</span>
          </div>
          <div className="lb-row">
            <span className="lb-rank">2</span>
            <span className="lb-name">Максим Т.</span>
            <span className="lb-score">910 XP</span>
          </div>
          <div className="lb-row">
            <span className="lb-rank">3</span>
            <span className="lb-name">Олег С.</span>
            <span className="lb-score">860 XP</span>
          </div>
        </div>
        <div className="leaderboard-lock">
          <LockIcon />
          <b>Рейтинг з&apos;явиться скоро</b>
          <span>Порівнюйте прогрес із колегами свого регіону</span>
        </div>
      </div>
    </section>
  );
}
