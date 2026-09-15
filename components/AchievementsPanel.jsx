import { LockIcon } from "@/components/icons";
import { RatingCard } from "@/components/RatingBlocks";
import { CertificateList } from "@/components/CertificateList";

/**
 * Екран «Досягнення» — спільний для /hub і /manager:
 *  1. рейтинг (бали, рівень, місце в когорті) і «за що» — курси / бонуси / відзнаки;
 *  2. відзнаки (усі типи, зароблені підсвічені, з балами);
 *  3. сертифікати — кожен курс на 100% із прямим завантаженням PDF;
 *  4. лідери когорти — реальний топ по балах журналу (lib/rating.js).
 * Раніше тут був лідерборд по середньому балу території поверх XP-стелі.
 */
export function AchievementsPanel({ rating, badges, certificates, leaderboard, leaderboardTitle, currentEmployeeId, hasEmail, cohortLabel }) {
  return (
    <>
      <RatingCard rating={rating} cohortLabel={cohortLabel} href="#rating" />
      <div className="stats-row rt-breakdown">
        <div className="stat-pill">
          <b>{rating.courses}</b>
          <span>за курси</span>
        </div>
        <div className="stat-pill">
          <b>{rating.bonuses}</b>
          <span>бонуси</span>
        </div>
        <div className="stat-pill">
          <b>{rating.badges}</b>
          <span>за відзнаки</span>
        </div>
      </div>

      <div className="hub-sec-title">
        <h3>Відзнаки</h3>
      </div>
      {badges.length === 0 ? (
        <p className="hub-empty-note">Ачивок поки не заведено.</p>
      ) : (
        <div className="badge-grid">
          {badges.map((b) => (
            <div key={b.id} className={`badge-item${b.earned ? "" : " locked"}`} title={b.description || ""}>
              <div className="badge-ico">{b.icon || "⭐"}</div>
              <span>{b.title}</span>
              {b.points > 0 && <span className="badge-points">+{b.points}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="hub-sec-title">
        <h3>Сертифікати</h3>
      </div>
      <CertificateList certificates={certificates} hasEmail={hasEmail} />

      <div className="hub-sec-title">
        <h3>{leaderboardTitle}</h3>
      </div>
      <div className="leaderboard-wrap">
        {leaderboard.length > 0 ? (
          <div className="leaderboard-list">
            {leaderboard.map((row, i) => (
              <div className={`lb-row${row.id === currentEmployeeId ? " lb-row-self" : ""}`} key={row.id}>
                <span className="lb-rank">{i + 1}</span>
                <span className="lb-name">
                  {row.name}
                  {/* У польових ролей без email ім'я в базі — заглушка з
                      посади, тоді посада поруч лише дублює текст. */}
                  {row.position && row.position !== row.name && <span className="lb-pos"> · {row.position}</span>}
                </span>
                <span className="lb-score">
                  {row.normalized != null ? `${row.normalized}%` : `${row.points} балів`}
                  {row.normalized != null && <span className="lb-pos"> · {row.points} б.</span>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="leaderboard-lock">
            <LockIcon />
            <b>Рейтинг з&apos;явиться після перших складених курсів</b>
            <span>Бали — лише за реальні результати: складені курси, 100%, вчасно, відзнаки</span>
          </div>
        )}
      </div>
    </>
  );
}
