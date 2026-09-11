import { LockIcon, BowlingPinIcon, MedalIcon } from "@/components/icons";

/**
 * Вміст екрана "Досягнення" — значки + рейтинг регіону. Винесено з
 * app/hub/achievements/page.js, щоб той самий блок міг рендеритись і в
 * /manager/achievements (керівник — теж Employee зі своїми enrollments,
 * та сама логіка значків йому підходить без змін).
 */
export function AchievementsPanel({ passedCount }) {
  return (
    <>
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
          {/* Кегля замість 🔥 — "страйк"-рейт (серія поспіль), гра слів
              зі страйком у боулінгу. */}
          <div className="badge-ico badge-ico-svg">
            <BowlingPinIcon />
          </div>
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
            <span className="lb-rank">
              <MedalIcon tier="gold" />
            </span>
            <span className="lb-name">Ірина П.</span>
            <span className="lb-score">980 XP</span>
          </div>
          <div className="lb-row">
            <span className="lb-rank">
              <MedalIcon tier="silver" />
            </span>
            <span className="lb-name">Максим Т.</span>
            <span className="lb-score">910 XP</span>
          </div>
          <div className="lb-row">
            <span className="lb-rank">
              <MedalIcon tier="bronze" />
            </span>
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
    </>
  );
}
