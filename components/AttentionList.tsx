"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { RemindButton } from "@/components/ReminderDialog";
import type { AttentionItem, PersonSegment } from "@/lib/teamInsights";

const REASON_PILL: Record<PersonSegment, string> = {
  overdue: "status-pill-fail",
  behind: "status-pill-alert",
  not_started: "status-pill-neutral",
  inactive: "status-pill-neutral",
  on_track: "status-pill-success",
};

/**
 * «Потребують уваги» — топ-5 людей за терміновістю (lib/teamInsights.ts
 * attentionTop): ім'я → сторінка людини, чипи причин, «Нагадати» з
 * шаблоном за найгіршою причиною і курсом-прикладом.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <>
      {items.length === 0 ? (
        <p className="admin-hint">Усі за графіком — нагадувати нікому.</p>
      ) : (
        <ul className="mgr-attention-list">
          {items.map(({ person, reasons }) => {
            const primary = reasons[0];
            return (
              <li key={person.id} className="mgr-attention-row">
                <Avatar name={person.name} src={person.avatarUrl} size="sm" />
                <div className="mgr-attention-main">
                  <Link href={`/manager/team/${person.id}`} className="mgr-attention-name">
                    {person.name}
                  </Link>
                  <span className="mgr-attention-meta">{person.positionName || "—"}</span>
                  <span className="mgr-attention-reasons">
                    {reasons.map((r) => (
                      <span key={r.kind} className={`status-pill ${REASON_PILL[r.kind]}`} title={r.courseTitle ? `${r.courseTitle}${r.dueDateLabel ? ` · до ${r.dueDateLabel}` : ""}` : undefined}>
                        {r.label}
                      </span>
                    ))}
                  </span>
                </div>
                <RemindButton
                  recipients={[{ id: person.id, name: person.name }]}
                  courseId={primary?.courseId ?? null}
                  courseTitle={primary?.courseTitle ?? null}
                  reason={primary?.kind ?? "general"}
                  dueDateLabel={primary?.dueDateLabel ?? null}
                />
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/manager/team" className="admin-btn-link mgr-attention-all">
        Уся команда
      </Link>
    </>
  );
}
