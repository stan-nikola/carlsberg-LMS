import Link from "next/link";
import { SEGMENT_META, pluralCourses, pluralPeople, type PersonSegment, type StatusBarSegment } from "@/lib/teamInsights";

const SEGMENT_PILL: Record<PersonSegment, string> = {
  overdue: "status-pill-fail",
  behind: "status-pill-alert",
  not_started: "status-pill-neutral",
  inactive: "status-pill-neutral",
  on_track: "status-pill-success",
};

/** Статус людини одним словом — той самий .status-pill, що й скрізь. */
export function SegmentPill({ segment }: { segment: PersonSegment | null }) {
  if (!segment) return <span className="status-pill status-pill-neutral">Без призначень</span>;
  return <span className={`status-pill ${SEGMENT_PILL[segment]}`}>{SEGMENT_META[segment].label}</span>;
}

/**
 * Верх дашборда /manager (замість п'яти KPI-плиток, 2026-09-23): одна
 * полоса — кожна людина рівно в одному сегменті (найгірший стан
 * перемагає), кожен сегмент — посилання на список саме цих людей.
 */
/** «7 людей · 8 курсів» — одиниця завжди названа: сегмент рахує ЛЮДЕЙ, а
 *  друге число каже, скільки призначень команди в цьому стані. */
function segmentTitle(s: StatusBarSegment): string {
  const people = `${s.count} ${pluralPeople(s.count)}`;
  return s.courses == null ? `${s.label}: ${people}` : `${s.label}: ${people} · ${s.courses} ${pluralCourses(s.courses)}`;
}

/** Вміст картки «Стан команди». Рамку, заголовок і ручки розміру дає
 *  сама картка сітки (.mgr-chart-card у ManagerDashboard.jsx) — так полоса
 *  живе за тими ж правилами, що й решта панелей: перетягування, зміна
 *  розміру, приховування (рішення користувача, 2026-09-23). */
export function TeamStatusBar({ data }: { data: { segments: StatusBarSegment[]; total: number; noEnrollments: number } }) {
  const nonEmpty = data.segments.filter((s) => s.count > 0);
  if (data.total === 0) return <p className="admin-hint">У команди ще немає призначених курсів.</p>;
  return (
    <div className="mgr-status-body">
      <div className="mgr-status-bar" role="img" aria-label={nonEmpty.map(segmentTitle).join(", ")}>
        {nonEmpty.map((s) => (
          <Link key={s.key} href={s.href} className={`mgr-status-seg is-${s.key}`} style={{ flexGrow: s.count }} title={segmentTitle(s)}>
            <span className="mgr-status-seg-count">{s.count}</span>
          </Link>
        ))}
      </div>
      <ul className="mgr-status-legend">
        {data.segments.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={`mgr-status-legend-item is-${s.key}${s.count === 0 ? " is-empty" : ""}`} title={segmentTitle(s)}>
              <span className="mgr-status-dot" aria-hidden="true" />
              <span className="mgr-status-legend-label">{s.label}</span>
              <b>
                {s.count} {pluralPeople(s.count)}
              </b>
              {s.courses != null && s.courses > 0 && (
                <span className="mgr-status-legend-sub">
                  · {s.courses} {pluralCourses(s.courses)}
                </span>
              )}
            </Link>
          </li>
        ))}
        {data.noEnrollments > 0 && (
          <li>
            <Link href="/manager/team?status=none" className="mgr-status-legend-item is-none">
              без призначень <b>{data.noEnrollments}</b>
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
