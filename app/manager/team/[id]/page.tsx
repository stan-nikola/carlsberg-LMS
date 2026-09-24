import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getAllSubordinates } from "@/lib/permissions";
import { getManagerEmployeeDetail, getManagerTeamRows } from "@/lib/managerOverview";
import { Avatar } from "@/components/Avatar";
import { EnrollmentRow, type EnrollmentDetail } from "@/components/EnrollmentRow";
import { SegmentPill } from "@/components/TeamStatusBar";
import { RemindButton } from "@/components/ReminderDialog";
import { BackButton } from "@/components/BackButton";
import { pluralize } from "@/lib/pluralize";

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
  const c = person.counts;
  // `completed` рахує і складені, і провалені — складено = різниця.
  const passedCount = c.completed - c.failed;
  const allPassed = c.total > 0 && passedCount === c.total;
  const courses = (n: number) => pluralize(n, "курс", "курси", "курсів");

  return (
    <div className="manager-page manager-person-page">
      {/* Шапка drill-down: кругла «назад» — риска — крихти. Кнопка повертає
          на попередній екран як був (історія), крихта «КОМАНДА» — завжди на
          список: два різні наміри, обидва потрібні. */}
      <div className="mgr-page-head">
        <BackButton fallback="/manager/team" />
        <span className="mgr-page-head-rule" aria-hidden="true" />
        <h1 className="greeting hub-greeting-h1">
          <Link href="/manager/team" className="mgr-crumb">
            КОМАНДА
          </Link>
          <span aria-hidden="true"> / </span>
          {person.name.toUpperCase()}
        </h1>
      </div>

      <section className="mgr-person-card">
        <Avatar name={person.name} src={person.avatarUrl} size="md" />
        <div className="mgr-person-main">
          <div className="mgr-person-name">{person.name}</div>
          <div className="admin-hint">
            {person.positionName || "—"}
            {person.externalCode && <span className="mgr-person-code"> · {person.externalCode}</span>}
          </div>
          {/* Лічильники — кожен зі своєю одиницею (2026-09-24): «5/7 курсів ·
              1 прострочено» читалось як «прострочено що?». Нулі не показуємо
              — рядок із п'яти «0» нічого не каже. */}
          <div className="mgr-person-pills">
            <SegmentPill segment={person.segment} />
            <span className={`mgr-badge${person.inactive ? " mgr-badge-overdue" : ""}`}>Останній вхід: {person.lastSeenLabel}</span>
            <span className={`mgr-badge${allPassed ? " mgr-badge-success" : ""}`}>Складено: {passedCount} з {c.total}</span>
            {c.failed > 0 && <span className="mgr-badge mgr-badge-overdue">Не складено: {c.failed}</span>}
            {c.inProgress > 0 && <span className="mgr-badge">В процесі: {c.inProgress}</span>}
            {c.notStarted > 0 && <span className="mgr-badge">Не розпочато: {c.notStarted}</span>}
            {c.overdue > 0 && <span className="mgr-badge mgr-badge-overdue">Прострочено: {courses(c.overdue)}</span>}
            {c.behind > 0 && <span className="mgr-badge">Відстає від графіка: {courses(c.behind)}</span>}
            {c.avgScore != null && <span className={`mgr-badge mgr-badge-score${c.failed > 0 ? " mgr-badge-fail" : ""}`}>Середній бал: {c.avgScore}%</span>}
          </div>
        </div>
        {/* Усе складено — нагадувати нема про що, є за що похвалити. */}
        {allPassed ? (
          <RemindButton recipients={[recipient]} mode="praise" className="btn btn-primary mgr-team-remind" />
        ) : (
          <RemindButton
            recipients={[recipient]}
            reason={person.segment && person.segment !== "on_track" ? person.segment : c.failed > 0 ? "failed" : "general"}
            className="btn btn-primary mgr-team-remind"
            disabled={c.total === 0}
          />
        )}
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
