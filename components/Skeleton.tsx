/**
 * Скелетон замість спінера «Завантаження…»: сірі плашки у формі майбутнього
 * контенту, по яких іде та сама повільна хвиля, що на кнопках акордеону в
 * курсі (.tap-next / .cp-img-skeleton, 5.8s). Один універсальний макет
 * «заголовок + картки» на всі екрани кабінетів (рішення користувача,
 * 2026-09-16) — сітка .card-grid сама дає 1 колонку в телефонній рамці
 * /hub і 3 в /manager.
 *
 * Де показується: app/(manager|hub)/loading.tsx і app/courses/[slug]/
 * loading.tsx (Next показує їх МИТТЄВО при переході, не чекаючи серверного
 * рендера нової сторінки), клієнтські fetch у ManagerDashboard і
 * NotificationCenter.
 */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`sk${className ? ` ${className}` : ""}`} style={style} aria-hidden="true" />;
}

/** Картка: заголовок, два рядки тексту, кнопка внизу — як CourseTile. */
export function CardSkeleton() {
  return (
    <div className="sk-card" aria-hidden="true">
      <Skeleton className="sk-line" style={{ width: "62%", height: 14 }} />
      <Skeleton className="sk-line" style={{ width: "88%" }} />
      <Skeleton className="sk-line" style={{ width: "44%" }} />
      <Skeleton className="sk-btn" />
    </div>
  );
}

/** Кілька рядків списку (стрічка сповіщень, розгорнута людина в команді). */
export function LinesSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="sk-lines" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="sk-line" style={{ width: `${88 - (i % 3) * 14}%` }} />
      ))}
    </div>
  );
}

/** Цілий екран: заголовок + N карток. role=status — читачам екрана
 *  повідомляється «Завантаження» без візуального тексту. */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="sk-page" role="status" aria-label="Завантаження">
      <Skeleton className="sk-title" />
      <div className="card-grid">
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
