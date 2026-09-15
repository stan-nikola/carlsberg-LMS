import { LockIcon } from "@/components/icons";
import { RatingCard } from "@/components/RatingBlocks";
import { CertificateList } from "@/components/CertificateList";
import { LocalName } from "@/components/LocalName";

/**
 * Екран «Досягнення» — спільний для /hub і /manager:
 *  1. рейтинг (бали, рівень, місце в когорті) і «за що» — курси / бонуси / відзнаки;
 *  2. відзнаки (усі типи, зароблені підсвічені, з балами);
 *  3. сертифікати — кожен курс на 100% із прямим завантаженням PDF;
 *  4. лідери когорти — реальний топ по балах журналу (lib/rating.ts).
 * Раніше тут був лідерборд по середньому балу території поверх XP-стелі.
 */
export function AchievementsPanel({ rating, badges, certificates, leaderboard, leaderboardTitle, currentEmployeeId, hasEmail, cohortLabel }) {
  return (
    // Один компонент і в телефонній рамці /hub, і на десктопі /manager —
    // тому розкладка адаптується @container (ach), не @media (CLAUDE.md,
    // «Верстка»): у /hub контейнер завжди вузький, у кабінеті керівника
    // від 640px секції стають у дві колонки (app/styles/rating.css).
    <div className="ach-panel">
      {/* Контейнер не може запитувати сам себе — сітка на внутрішньому div. */}
      <div className="ach-grid">
      <div className="ach-col">
      <section className="ach-rating">
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
      </section>

      <section className="ach-badges">
      <div className="hub-sec-title">
        <h3>Відзнаки</h3>
      </div>
      {badges.length === 0 ? (
        <p className="hub-empty-note">Відзнак поки не заведено.</p>
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

      </section>

      <section className="ach-certs">
      <div className="hub-sec-title">
        <h3>Сертифікати</h3>
      </div>
      <CertificateList certificates={certificates} hasEmail={hasEmail} />
      </section>
      </div>

      <div className="ach-col">
      <section className="ach-lb">
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
                  {/* Свій рядок: у польових ролей у базі лише посада — беремо ім’я
                      з localStorage цього пристрою (components/LocalName.tsx). */}
                  {row.id === currentEmployeeId ? <LocalName dbName={row.name} hasEmail={hasEmail} /> : row.name}
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
      </section>
      </div>
      </div>
    </div>
  );
}
