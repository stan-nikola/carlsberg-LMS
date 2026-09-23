import Link from "next/link";
import { SEGMENT_META, type PersonSegment, type StatusBarSegment } from "@/lib/teamInsights";

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
export function TeamStatusBar({ data }: { data: { segments: StatusBarSegment[]; total: number; noEnrollments: number } }) {
  const nonEmpty = data.segments.filter((s) => s.count > 0);
  return (
    <section className="mgr-status" aria-label="Стан команди">
      <div className="mgr-status-head">
        <h2>Стан команди</h2>
        <span className="admin-hint">{data.total} із призначеннями</span>
      </div>
      {data.total === 0 ? (
        <p className="admin-hint">У команди ще немає призначених курсів.</p>
      ) : (
        <>
          <div className="mgr-status-bar" role="img" aria-label={nonEmpty.map((s) => `${s.label}: ${s.count}`).join(", ")}>
            {nonEmpty.map((s) => (
              <Link key={s.key} href={s.href} className={`mgr-status-seg is-${s.key}`} style={{ flexGrow: s.count }} title={`${s.label}: ${s.count}`}>
                <span className="mgr-status-seg-count">{s.count}</span>
              </Link>
            ))}
          </div>
          <ul className="mgr-status-legend">
            {data.segments.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className={`mgr-status-legend-item is-${s.key}${s.count === 0 ? " is-empty" : ""}`}>
                  <span className="mgr-status-dot" aria-hidden="true" />
                  {s.label}
                  <b>{s.count}</b>
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
        </>
      )}
    </section>
  );
}
