import Link from "next/link";

/**
 * Два блоки головної хаба замість «Прогрес адаптації 200/200 XP» (той
 * упирався в стелю після двох курсів і далі нічого не значив):
 *  - RatingCard — бали, рівень, місце в когорті (та сама посада);
 *  - MandatoryCard — обов'язкові курси: пройдено / прострочено / дедлайн.
 * Серверні компоненти без стану — дані приходять готовими з
 * lib/rating.js getEmployeeRating і lib/ratingLogic.js mandatoryProgress.
 */
export function RatingCard({ rating, cohortLabel, href = "/hub/achievements" }) {
  const { total, level, rank, size } = rating;
  const toNext = level.next ? level.next.threshold - total : 0;
  return (
    <Link href={href} className="rt-card">
      <div className="rt-top">
        <div>
          <div className="rt-points">
            {total} <span>балів</span>
          </div>
          <div className="rt-level">
            <span className="lv-star">★</span> Рівень: {level.label}
          </div>
        </div>
        {rank && (
          <div className="rt-rank">
            <b>№ {rank}</b>
            <span>
              з {size} {cohortLabel}
            </span>
          </div>
        )}
      </div>
      <div className="xp-track">
        <div className="xp-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
      <div className="rt-next">{level.next ? `Ще ${toNext} балів до рівня «${level.next.label}»` : "Найвищий рівень"}</div>
    </Link>
  );
}

export function MandatoryCard({ progress }) {
  const { total, completed, overdue, nextDue } = progress;
  if (total === 0) return null;
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="rt-card rt-mandatory">
      <div className="rt-top">
        <div>
          <div className="rt-points">
            {completed}/{total} <span>обов&apos;язкових курсів</span>
          </div>
          <div className="rt-level">
            {overdue > 0 ? (
              <span className="rt-overdue">Прострочено: {overdue}</span>
            ) : nextDue ? (
              <>Найближчий дедлайн: {nextDue.toLocaleDateString("uk-UA")}</>
            ) : completed === total ? (
              "Усе пройдено — так тримати!"
            ) : (
              "Без дедлайнів"
            )}
          </div>
        </div>
        <div className="rt-rank">
          <b>{pct}%</b>
        </div>
      </div>
      <div className="xp-track">
        <div className="xp-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
