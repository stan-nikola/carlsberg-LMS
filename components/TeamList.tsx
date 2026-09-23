"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { StatusPill } from "@/components/EnrollmentRow";
import { SegmentPill } from "@/components/TeamStatusBar";
import { RemindButton, type ReminderReason } from "@/components/ReminderDialog";
import { teamQueryHref, type TeamListResult, type TeamQuery } from "@/lib/teamInsights";

type Chip = { key: keyof TeamQuery; label: string };

/**
 * Сторінка списку /manager/team: усі фільтри — в URL (lib/teamInsights.ts
 * parseTeamQuery/applyTeamFilters), тут лише показ і навігація. Два види:
 * люди (рядок = людина зі станом) і призначення (рядок = людина × курс).
 * Чекбокси → «Нагадати обраним» (один діалог на всіх).
 */
export function TeamList({
  result,
  chips,
  courseId,
  courseTitle,
}: {
  result: TeamListResult;
  chips: Chip[];
  courseId: number | null;
  courseTitle: string | null;
}) {
  const { query, people, rows } = result;
  const router = useRouter();
  const [q, setQ] = useState(query.q);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const without = (key: keyof TeamQuery) => teamQueryHref({ ...query, [key]: key === "retried" ? false : key === "q" ? "" : null });
  const viewHref = (view: TeamQuery["view"]) =>
    teamQueryHref({ view, team: query.team, q: query.q, course: query.course, sort: query.sort });

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.replace(teamQueryHref({ ...query, q: q.trim() }), { scroll: false });
  }
  function changeSort(sort: TeamQuery["sort"]) {
    router.replace(teamQueryHref({ ...query, sort }), { scroll: false });
  }

  const ids = query.view === "people" ? people.map((p) => p.id) : Array.from(new Set(rows.map((r) => r.employeeId)));
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ids));
  }
  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const recipients = Array.from(selected)
    .filter((id) => nameById.has(id))
    .map((id) => ({ id, name: nameById.get(id)! }));
  const reason: ReminderReason =
    query.status === "overdue" || query.due === "overdue" ? "overdue" : query.status === "behind" ? "behind" : query.status === "not_started" ? "not_started" : query.status === "inactive" ? "inactive" : "general";

  return (
    <div className="mgr-team-list">
      <div className="mgr-team-toolbar">
        <div className="mgr-team-views" role="tablist">
          <Link href={viewHref("people")} className={`mgr-filter-chip${query.view === "people" ? " is-active" : ""}`} role="tab" aria-selected={query.view === "people"}>
            Люди
          </Link>
          <Link href={viewHref("courses")} className={`mgr-filter-chip${query.view === "courses" ? " is-active" : ""}`} role="tab" aria-selected={query.view === "courses"}>
            Призначення
          </Link>
        </div>
        <form className="mgr-team-search" onSubmit={submitSearch} role="search">
          <input className="admin-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за іменем" aria-label="Пошук за іменем" />
        </form>
        <label className="mgr-team-sort">
          <span className="admin-hint">Сортувати</span>
          <select className="admin-input" value={query.sort} onChange={(e) => changeSort(e.target.value as TeamQuery["sort"])}>
            <option value="urgency">за терміновістю</option>
            <option value="name">за іменем</option>
            <option value="score">за балом</option>
          </select>
        </label>
      </div>

      {chips.length > 0 && (
        <ul className="mgr-team-filters" aria-label="Активні фільтри">
          {chips.map((c) => (
            <li key={c.key}>
              <Link href={without(c.key)} className="mgr-filter-chip is-active" title="Зняти фільтр">
                {c.label} <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href={teamQueryHref({ view: query.view })} className="admin-btn-link">
              Скинути все
            </Link>
          </li>
        </ul>
      )}

      <div className="mgr-team-bulk">
        <span className="admin-hint">
          {query.view === "people" ? `${people.length} люд.` : `${rows.length} призначень · ${ids.length} люд.`}
          {selected.size > 0 ? ` · обрано ${recipients.length}` : ""}
        </span>
        <RemindButton
          recipients={recipients}
          courseId={courseId}
          courseTitle={courseTitle}
          reason={reason}
          label={`Нагадати обраним${recipients.length ? ` (${recipients.length})` : ""}`}
          className="btn btn-primary mgr-team-remind"
        />
      </div>

      {ids.length === 0 ? (
        <p className="admin-hint">Нікого не знайдено за цими умовами.</p>
      ) : query.view === "people" ? (
        <div className="mgr-table-wrap">
          <table className="admin-table mgr-team-table">
            <thead>
              <tr>
                <th scope="col">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Обрати всіх" />
                </th>
                <th scope="col">Людина</th>
                <th scope="col">Стан</th>
                <th scope="col">Курси</th>
                <th scope="col">Прострочено</th>
                <th scope="col">Відстає</th>
                <th scope="col">Бал</th>
                <th scope="col">Останній вхід</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className={selected.has(p.id) ? "is-selected" : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Обрати ${p.name}`} />
                  </td>
                  <td>
                    <Link href={`/manager/team/${p.id}`} className="mgr-team-person">
                      <Avatar name={p.name} src={p.avatarUrl} size="sm" />
                      <span className="mgr-team-person-text">
                        <span className="mgr-team-person-name">{p.name}</span>
                        <span className="admin-hint">{p.positionName || "—"}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <SegmentPill segment={p.segment} />
                  </td>
                  <td className="mgr-num">
                    {p.counts.completed}/{p.counts.total}
                  </td>
                  <td className={`mgr-num${p.counts.overdue ? " is-bad" : ""}`}>{p.counts.overdue || "—"}</td>
                  <td className={`mgr-num${p.counts.behind ? " is-warn" : ""}`}>{p.counts.behind || "—"}</td>
                  <td className="mgr-num">{p.counts.avgScore != null ? `${p.counts.avgScore}%` : "—"}</td>
                  <td className={p.inactive ? "is-warn" : undefined}>{p.lastSeenLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mgr-table-wrap">
          <table className="admin-table mgr-team-table">
            <thead>
              <tr>
                <th scope="col">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Обрати всіх" />
                </th>
                <th scope="col">Людина</th>
                <th scope="col">Курс</th>
                <th scope="col">Статус</th>
                <th scope="col">Модулі</th>
                <th scope="col">Дедлайн</th>
                <th scope="col">Бал</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.enrollmentId} className={selected.has(r.employeeId) ? "is-selected" : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.employeeId)} onChange={() => toggle(r.employeeId)} aria-label={`Обрати ${r.employeeName}`} />
                  </td>
                  <td>
                    <Link href={`/manager/team/${r.employeeId}`} className="mgr-team-person-name">
                      {r.employeeName}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/manager/team/${r.employeeId}?course=${encodeURIComponent(r.courseSlug)}`} className="mgr-team-course">
                      {r.courseTitle}
                    </Link>
                  </td>
                  <td className="mgr-team-status">
                    <StatusPill status={r.status} passed={r.passed} />
                    {r.schedule === "behind" && r.status !== "completed" && <span className="status-pill status-pill-alert">Відстає</span>}
                  </td>
                  <td className="mgr-num">
                    {r.modulesPassed}/{r.modulesTotal}
                  </td>
                  <td className={r.isOverdue ? "is-bad" : r.isLate ? "is-warn" : undefined}>{r.dueDateLabel || "—"}</td>
                  <td className="mgr-num">{r.scorePercent != null ? `${r.scorePercent}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
