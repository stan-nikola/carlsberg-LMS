import Link from "next/link";

/**
 * Два блоки головної хаба замість «Прогрес адаптації 200/200 XP» (той
 * упирався в стелю після двох курсів і далі нічого не значив):
 *  - RatingCard — повна картка рейтингу (бали, рівень, місце, прогрес) на
 *    "Досягнення"; на Home лишився лише короткий рядок "ще N балів" у
 *    самій ProfileCard (2026-09-22, друга ітерація) — цей компонент там
 *    більше не рендериться;
 *  - MandatoryCard — обов'язкові курси: пройдено / прострочено / дедлайн,
 *    на Home клікабельна (веде на "Навчання", 2026-09-22).
 * `highlighted` (RatingCard) — прийшли з клікабельної зеленої картки
 * Home (?highlight=rating): один спалах синьої рамки, що сам плавно
 * гасне (rt-card-highlight, rating.css) — без scrollIntoView: картка й
 * так перший блок під заголовком "Ваш прогрес", а скрол відносно
 * СВОГО контейнера (.hub-viewport) зсував сам заголовок за верхній
 * край екрана (скарга користувача, 2026-09-22).
 */
export function RatingCard({ rating, cohortLabel, href = "/hub/achievements", highlighted = false }) {
  const { total, level, rank, size } = rating;
  const toNext = level.next ? level.next.threshold - total : 0;

  return (
    <Link href={href} className={`rt-card${highlighted ? " rt-card-highlight" : ""}`}>
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

export function MandatoryCard({ progress, href }) {
  const { total, completed, overdue, nextDue } = progress;
  if (total === 0) return null;
  const pct = Math.round((completed / total) * 100);
  const Tag = href ? Link : "div";
  return (
    <Tag href={href} className="rt-card rt-mandatory">
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
    </Tag>
  );
}
