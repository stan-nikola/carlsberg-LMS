import { LockIcon } from "@/components/icons";

/**
 * Вміст екрана "Досягнення" — значки + рейтинг регіону. Винесено з
 * app/hub/achievements/page.js, щоб той самий блок міг рендеритись і в
 * /manager/achievements (керівник — теж Employee зі своїми enrollments,
 * та сама логіка значків йому підходить без змін).
 *
 * Раніше (до Фази C адмінки) увесь вміст, крім "Курс складено", був
 * хардкодженою заглушкою — фейковий leaderboard, 5 із 6 значків завжди
 * заблоковані. Тепер `badges`/`leaderboard` — реальні дані
 * (lib/achievements.js): badges = усі типи ачивок з БД (manual + auto,
 * lib/badgeRules.js) із прапорцем earned; leaderboard = реальний топ по
 * середньому балу в межах території співробітника.
 */
export function AchievementsPanel({ badges, leaderboard, currentEmployeeId }) {
  return (
    <>
      <div className="hub-sec-title">
        <h3>Значки</h3>
      </div>
      {badges.length === 0 ? (
        <p className="hub-empty-note">Ачивок поки не заведено.</p>
      ) : (
        <div className="badge-grid">
          {badges.map((b) => (
            <div key={b.id} className={`badge-item${b.earned ? "" : " locked"}`} title={b.description || ""}>
              <div className="badge-ico">{b.icon || "⭐"}</div>
              <span>{b.title}</span>
            </div>
          ))}
        </div>
      )}

      <div className="hub-sec-title">
        <h3>Рейтинг регіону</h3>
      </div>
      <div className="leaderboard-wrap">
        {leaderboard.length > 0 ? (
          <div className="leaderboard-list">
            {leaderboard.map((row, i) => (
              <div className={`lb-row${row.id === currentEmployeeId ? " lb-row-self" : ""}`} key={row.id}>
                <span className="lb-rank">{i + 1}</span>
                <span className="lb-name">{row.name}</span>
                <span className="lb-score">{row.avgScore}% сер. бал</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="leaderboard-lock">
            <LockIcon />
            <b>Рейтинг з&apos;явиться, коли з&apos;являться перші складені курси у вашій території</b>
            <span>Порівнюйте прогрес із колегами свого регіону</span>
          </div>
        )}
      </div>
    </>
  );
}
