"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { RemindButton } from "@/components/manager/ReminderDialog";
import { SEGMENT_META, type AttentionItem } from "@/lib/teamInsights";


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
          {items.map(({ person, reasons }, i) => {
            const primary = reasons[0];
            return (
              <li key={person.id} className="mgr-attention-row" style={{ "--i": i } as React.CSSProperties}>
                <Avatar name={person.name} src={person.avatarUrl} size="sm" />
                <div className="mgr-attention-main">
                  <Link href={`/manager/team/${person.id}`} className="mgr-attention-name">
                    {person.name}
                  </Link>
                  <span className="mgr-attention-meta">{person.positionName || "—"}</span>
                  <span className="mgr-attention-reasons">
                    {reasons.map((r) => (
                      <span key={r.kind} className={`status-pill ${SEGMENT_META[r.kind].pill}`} title={r.courseTitle ? `${r.courseTitle}${r.dueDateLabel ? ` · до ${r.dueDateLabel}` : ""}` : undefined}>
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
                  dueDate={primary?.dueDate ?? null}
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
