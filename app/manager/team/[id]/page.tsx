import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getAllSubordinates } from "@/lib/permissions";
import { getManagerEmployeeDetail, getManagerTeamRows } from "@/lib/managerOverview";
import { Avatar } from "@/components/Avatar";
import { EnrollmentRow, type EnrollmentDetail } from "@/components/EnrollmentRow";
import { SegmentPill } from "@/components/TeamStatusBar";
import { RemindButton } from "@/components/ReminderDialog";

// TODO: Cache Components adoption — той самий опт-аут, що на app/manager/page.js.
export const instant = false;

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * /manager/team/[id] — одна людина: стан, курси з модулями, «Нагадати».
 * Межі ієрархії — як у /api/manager/employees/[id]: [id] має бути серед
 * getAllSubordinates(керівник), інакше 404 (не 403 — не підтверджуємо,
 * що такий співробітник узагалі існує). Admin-роль цього не обходить.
 */
export default async function ManagerPersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const me = await getCurrentUser();
  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) notFound();

  const subordinateIds = await getAllSubordinates(me!.id);
  if (!subordinateIds.includes(targetId)) notFound();

  const [data, detail] = await Promise.all([getManagerTeamRows(me!.id), getManagerEmployeeDetail(targetId)]);
  const person = data.people.find((p) => p.id === targetId);
  if (!person) notFound();

  const sp = await searchParams;
  const highlight = typeof sp?.course === "string" ? sp.course : null;
  const rowBySlug = new Map(data.rows.filter((r) => r.employeeId === targetId).map((r) => [r.courseSlug, r]));
  const recipient = { id: person.id, name: person.name };
  const enrollments = detail as EnrollmentDetail[];

  return (
    <div className="manager-page manager-person-page">
      <h1 className="greeting hub-greeting-h1">
        <Link href="/manager/team" className="mgr-crumb">
          КОМАНДА
        </Link>
        <span aria-hidden="true"> / </span>
        {person.name.toUpperCase()}
      </h1>

      <section className="mgr-person-card">
        <Avatar name={person.name} src={person.avatarUrl} size="md" />
        <div className="mgr-person-main">
          <div className="mgr-person-name">{person.name}</div>
          <div className="admin-hint">{person.positionName || "—"}</div>
          <div className="mgr-person-pills">
            <SegmentPill segment={person.segment} />
            <span className={`mgr-badge${person.inactive ? " mgr-badge-overdue" : ""}`}>Останній вхід: {person.lastSeenLabel}</span>
            <span className="mgr-badge">
              {person.counts.completed}/{person.counts.total} курсів
            </span>
            {person.counts.avgScore != null && <span className="mgr-badge mgr-badge-score">{person.counts.avgScore}%</span>}
            {person.counts.overdue > 0 && <span className="mgr-badge mgr-badge-overdue">{person.counts.overdue} прострочено</span>}
            {person.counts.behind > 0 && <span className="mgr-badge">{person.counts.behind} відстає</span>}
          </div>
        </div>
        <RemindButton
          recipients={[recipient]}
          reason={person.segment && person.segment !== "on_track" ? person.segment : "general"}
          className="btn btn-primary mgr-team-remind"
          disabled={person.counts.total === person.counts.completed}
        />
      </section>

      {enrollments.length === 0 ? (
        <p className="admin-hint">Курсів не призначено.</p>
      ) : (
        <ul className="mgr-enrollment-list card-grid">
          {enrollments.map((e) => (
            <EnrollmentRow
              key={e.id}
              enrollment={e}
              schedule={rowBySlug.get(e.course.slug)?.schedule ?? null}
              highlighted={highlight === e.course.slug}
              remindRecipient={recipient}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
