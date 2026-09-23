import Link from "next/link";
import type { CellStatus, TeamMatrixData } from "@/lib/teamInsights";

const CELL_META: Record<CellStatus, { label: string; mark: string }> = {
  passed: { label: "Складено", mark: "✓" },
  failed: { label: "Не складено", mark: "✗" },
  overdue: { label: "Прострочено", mark: "!" },
  behind: { label: "Відстає від графіка", mark: "↓" },
  in_progress: { label: "В процесі", mark: "…" },
  not_started: { label: "Не розпочато", mark: "·" },
};

/**
 * Матриця люди × курси (замість «Статус по людях», 2026-09-23): уся команда
 * одним поглядом, клітинка — стан призначення, клік — курс цієї людини.
 * Справжня <table> (правило проекту), горизонтальний скрол у обгортці.
 * prefetch={false} на клітинках: до 15×8 посилань, кожне — окремий
 * динамічний маршрут для App Shell.
 */
export function TeamMatrix({ data }: { data: TeamMatrixData }) {
  if (data.rows.length === 0) return <p className="admin-hint">Немає призначень у команді.</p>;
  return (
    <>
      {/* Горизонтальний скрол із «тінями» на краях (CSS, .mgr-matrix-wrap):
          перша колонка липка, тож ім'я завжди видно — той самий приклад, що
          в матрицях навчання SAP SF/Cornerstone. */}
      <div className="mgr-matrix-wrap">
        <table className="admin-table mgr-matrix">
          <thead>
            <tr>
              <th scope="col" className="mgr-matrix-corner">
                Людина
              </th>
              {data.courses.map((c) => (
                <th key={c.id} scope="col">
                  {/* Назва курсу вертикально (writing-mode) — колонка
                      стискається до ~30px, тож у картку влазить удвічі-втричі
                      більше курсів, ніж горизонтальним підписом. */}
                  <Link href={`/manager/team?view=courses&course=${encodeURIComponent(c.slug)}`} className="mgr-matrix-course" title={c.title}>
                    {c.title}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(({ person, cells }) => (
              <tr key={person.id}>
                <th scope="row" className="mgr-matrix-corner">
                  <Link href={`/manager/team/${person.id}`} prefetch={false} className="mgr-matrix-person">
                    {person.name}
                  </Link>
                </th>
                {cells.map((cell) => (
                  <td key={cell.courseSlug} className="mgr-matrix-td">
                    {cell.status ? (
                      <Link
                        href={`/manager/team/${person.id}?course=${encodeURIComponent(cell.courseSlug)}`}
                        prefetch={false}
                        className={`mgr-matrix-cell is-${cell.status}`}
                        aria-label={`${person.name}: ${CELL_META[cell.status].label}`}
                        title={CELL_META[cell.status].label}
                      >
                        {CELL_META[cell.status].mark}
                      </Link>
                    ) : (
                      <span className="mgr-matrix-cell is-empty" aria-label={`${person.name}: не призначено`} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mgr-matrix-legend" aria-hidden="true">
        {(Object.keys(CELL_META) as CellStatus[]).map((k) => (
          <li key={k}>
            <span className={`mgr-matrix-cell is-${k}`}>{CELL_META[k].mark}</span> {CELL_META[k].label}
          </li>
        ))}
      </ul>
      {data.hiddenPeople > 0 && (
        <p className="admin-hint mgr-people-status-more">
          <Link href="/manager/team">і ще {data.hiddenPeople} — уся команда</Link>
        </p>
      )}
    </>
  );
}
