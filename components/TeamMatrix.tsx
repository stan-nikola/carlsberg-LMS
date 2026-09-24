"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CellStatus, TeamMatrixData } from "@/lib/teamInsights";
import { EMPTY_SIZES, parseSizes, resizedTo, sizeOf, withSize, type MatrixSizeKind, type MatrixSizes } from "@/lib/matrixSizes";

const CELL_META: Record<CellStatus, { label: string; mark: string }> = {
  passed: { label: "Складено", mark: "✓" },
  failed: { label: "Не складено", mark: "✗" },
  overdue: { label: "Прострочено", mark: "!" },
  behind: { label: "Відстає від графіка", mark: "↓" },
  in_progress: { label: "В процесі", mark: "…" },
  not_started: { label: "Не розпочато", mark: "·" },
};

const SIZES_STORAGE_KEY = "carls_manager_matrix_sizes_v1";

function readStoredSizes(): MatrixSizes {
  if (typeof window === "undefined") return EMPTY_SIZES;
  try {
    return parseSizes(window.localStorage.getItem(SIZES_STORAGE_KEY));
  } catch {
    return EMPTY_SIZES;
  }
}

/**
 * Матриця люди × курси (замість «Статус по людях», 2026-09-23): уся команда
 * одним поглядом, клітинка — стан призначення, клік — курс цієї людини.
 * Справжня <table> (правило проекту), горизонтальний скрол у обгортці.
 * prefetch={false} на клітинках: до 15×8 посилань, кожне — окремий
 * динамічний маршрут для App Shell.
 *
 * 2026-09-24: назви курсів горизонтально у два рядки (вертикальні
 * обрізались із «…» — «Демо: модулі адаптації» не читалось), повна сітка
 * ліній, і межі колонок/рядків тягнуться мишею, як у Excel: ручка на
 * правому краї заголовка колонки й на нижньому краї імені. Подвійний клік
 * по ручці скидає розмір. Розміри — у localStorage (lib/matrixSizes.ts).
 * table-layout: fixed + <colgroup> — інакше браузер сам перерозподіляє
 * ширину за вмістом, і потягнута колонка «пливе».
 */
export function TeamMatrix({ data }: { data: TeamMatrixData }) {
  const [sizes, setSizes] = useState<MatrixSizes>(EMPTY_SIZES);
  const loadedRef = useRef(false);

  // Те саме, що readStoredLayout на дашборді: одноразове читання сховища
  // до першої промальовки, щоб кадру з дефолтними розмірами не було.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразове читання localStorage після монтування, не синхронізація зі стейтом React
    setSizes(readStoredSizes());
    loadedRef.current = true;
  }, []);

  function commit(next: MatrixSizes) {
    setSizes(next);
    if (!loadedRef.current) return;
    try {
      window.localStorage.setItem(SIZES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Приватний режим / заборонене сховище — розмір живе до перезавантаження.
    }
  }

  /**
   * Протягування ручки: pointer capture тримає рух і за межами ручки,
   * stopPropagation — щоб картка дашборда не сприйняла це як
   * перетягування самої картки в режимі редагування.
   */
  function startResize(e: React.PointerEvent<HTMLSpanElement>, kind: MatrixSizeKind, key: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const start = sizeOf(sizes, kind, key);
    const origin = kind === "row" ? e.clientY : e.clientX;
    let latest = sizes;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // Синтетична подія без реального pointerId — тягнемо без захоплення.
    }
    handle.classList.add("is-dragging");
    const onMove = (ev: PointerEvent) => {
      const delta = (kind === "row" ? ev.clientY : ev.clientX) - origin;
      latest = withSize(latest, kind, key, resizedTo(kind, start, delta));
      setSizes(latest);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      handle.classList.remove("is-dragging");
      commit(latest);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  if (data.rows.length === 0) return <p className="admin-hint">Немає призначень у команді.</p>;

  const nameWidth = sizeOf(sizes, "name");
  const colWidths = data.courses.map((c) => sizeOf(sizes, "col", c.slug));
  const tableWidth = nameWidth + colWidths.reduce((a, b) => a + b, 0);

  return (
    <>
      {/* Горизонтальний скрол із «тінями» на краях (CSS, .mgr-matrix-wrap):
          перша колонка липка, тож ім'я завжди видно — той самий приклад, що
          в матрицях навчання SAP SF/Cornerstone. */}
      <div className="mgr-matrix-wrap">
        <table className="admin-table mgr-matrix" style={{ width: tableWidth }}>
          <colgroup>
            <col style={{ width: nameWidth }} />
            {data.courses.map((c, i) => (
              <col key={c.id} style={{ width: colWidths[i] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="mgr-matrix-corner">
                Людина
                <span
                  className="mgr-matrix-handle mgr-matrix-handle-col"
                  onPointerDown={(e) => startResize(e, "name", "")}
                  onDoubleClick={() => commit(withSize(sizes, "name", "", null))}
                  title="Потягніть, щоб змінити ширину · подвійний клік — скинути"
                />
              </th>
              {data.courses.map((c) => (
                <th key={c.id} scope="col" className="mgr-matrix-th">
                  <Link href={`/manager/team?view=courses&course=${encodeURIComponent(c.slug)}`} className="mgr-matrix-course" title={c.title}>
                    {c.title}
                  </Link>
                  <span
                    className="mgr-matrix-handle mgr-matrix-handle-col"
                    onPointerDown={(e) => startResize(e, "col", c.slug)}
                    onDoubleClick={() => commit(withSize(sizes, "col", c.slug, null))}
                    title="Потягніть, щоб змінити ширину · подвійний клік — скинути"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(({ person, cells }) => {
              const rowKey = String(person.id);
              return (
                <tr key={person.id} style={{ height: sizeOf(sizes, "row", rowKey) }}>
                  <th scope="row" className="mgr-matrix-corner">
                    <Link href={`/manager/team/${person.id}`} prefetch={false} className="mgr-matrix-person">
                      {person.name}
                    </Link>
                    <span
                      className="mgr-matrix-handle mgr-matrix-handle-row"
                      onPointerDown={(e) => startResize(e, "row", rowKey)}
                      onDoubleClick={() => commit(withSize(sizes, "row", rowKey, null))}
                      title="Потягніть, щоб змінити висоту · подвійний клік — скинути"
                    />
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
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mgr-matrix-legend" aria-hidden="true">
        {(Object.keys(CELL_META) as CellStatus[]).map((k) => (
          <li key={k}>
            <span className={`mgr-matrix-cell is-${k}`}>{CELL_META[k].mark}</span> {CELL_META[k].label}
          </li>
        ))}
        <li className="mgr-matrix-legend-hint">Межі колонок і рядків можна тягнути; подвійний клік по межі — скинути</li>
      </ul>
      {data.hiddenPeople > 0 && (
        <p className="admin-hint mgr-people-status-more">
          <Link href="/manager/team">і ще {data.hiddenPeople} — уся команда</Link>
        </p>
      )}
    </>
  );
}
