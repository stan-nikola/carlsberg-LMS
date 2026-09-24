"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarIcon, ClockIcon, CheckIcon, XIcon, MedalIcon } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { medalTier } from "@/lib/progress";
import { RemindButton, type ReminderReason } from "@/components/ReminderDialog";
import type { ScheduleStatus } from "@/lib/coursePlan";

export type EnrollmentDetail = {
  id: number;
  course: { id: number; title: string; slug: string; isMandatory?: boolean };
  status: string;
  assignedAt?: Date | string | null;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
  scorePercent: number | null;
  scoreMax?: number | null;
  passed: boolean | null;
  durationSeconds: number | null;
  attempts?: { id: number; completedAt: Date | string; scorePercent: number | null; durationSeconds: number | null; passed: boolean | null }[];
  modules?: { id: number; title: string; order: number; scorePercent: number | null; scoreMax?: number | null; passed: boolean | null }[];
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Не розпочато", cls: "status-pill-neutral" },
  in_progress: { label: "В процесі", cls: "status-pill-alert" },
  overdue: { label: "Прострочено", cls: "status-pill-fail" },
};

// status="completed" саме по собі означає лише "пройшов до кінця" —
// НЕ "склав". Прохідний бал налаштовується per-курс (Course.passThreshold)
// — completed з passed:false мусить бути червоним "Не складено", а не
// зеленим "Завершено", інакше провалений курс візуально виглядає як успіх.
export function StatusPill({ status, passed }: { status: string; passed: boolean | null }) {
  if (status === "completed") {
    return <StatusBadge passed={Boolean(passed)} />;
  }
  const meta = STATUS_META[status] || STATUS_META.not_started;
  return <span className={`status-pill ${meta.cls}`}>{meta.label}</span>;
}

export function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** durationSeconds -> "12 хв" / "1 год 40 хв". */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} хв`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
}

/**
 * Картка одного призначення людини в кабінеті керівника — дерево команди на
 * /manager і сторінка людини /manager/team/[id]. Перенесено з
 * ManagerDashboard.jsx (2026-09-23) заради другого місця показу.
 * `schedule` — «відстає від графіка» з плану курсу (lib/teamInsights.ts);
 * `highlighted` — прийшли з матриці/списку саме до цього курсу;
 * `remindRecipient` — кнопка «Нагадати» по цьому курсу.
 */
export function EnrollmentRow({
  enrollment,
  schedule = null,
  highlighted = false,
  remindRecipient = null,
}: {
  enrollment: EnrollmentDetail;
  schedule?: ScheduleStatus | null;
  highlighted?: boolean;
  remindRecipient?: { id: number; name: string } | null;
}) {
  const date = formatDate(enrollment.completedAt);
  const dueDate = formatDate(enrollment.dueDate);
  const duration = formatDuration(enrollment.durationSeconds);
  const [showAttempts, setShowAttempts] = useState(false);
  const hasHistory = Boolean(enrollment.attempts && enrollment.attempts.length > 1);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "center" });
  }, [highlighted]);

  const unfinished = enrollment.status !== "completed";
  // Завершено, але прохідний бал не набрано — теж привід нагадати, тільки
  // текст інший («спробуйте ще раз», не «термін минув»). Складено — навпаки,
  // привід похвалити (2026-09-24): до цього на складених кнопки не було
  // взагалі, а на не складених — теж, бо рядок рахувався «завершеним».
  const failed = enrollment.status === "completed" && enrollment.passed === false;
  const passed = enrollment.status === "completed" && enrollment.passed === true;
  const reason: ReminderReason =
    enrollment.status === "overdue" ? "overdue" : failed ? "failed" : schedule === "behind" ? "behind" : enrollment.status === "not_started" ? "not_started" : "general";

  return (
    <li ref={ref} className={`mgr-enrollment-row${highlighted ? " is-highlighted" : ""}`} id={`enrollment-${enrollment.course.slug}`}>
      <div className="mgr-enrollment-main">
        {/* Перенос у 2 рядки, а не біжучий рядок: у сітці (до 4 в ряд)
            MarqueeText прокручував би назву КОЖНОГО курсу. */}
        <span className="mgr-enrollment-title">{enrollment.course.title}</span>
        <StatusPill status={enrollment.status} passed={enrollment.passed} />
        {schedule === "behind" && unfinished && <span className="status-pill status-pill-alert">Відстає від графіка</span>}
      </div>
      <div className="mgr-enrollment-stats">
        {enrollment.scorePercent != null && <span className="mgr-stat-chip">{enrollment.scorePercent}% балів</span>}
        {date ? (
          <span className="mgr-stat-chip">
            <CalendarIcon /> {date}
          </span>
        ) : (
          // Ще не завершено — дедлайн замість дати завершення, щоб рядок
          // статистики ніколи не був порожнім.
          dueDate && (
            <span className="mgr-stat-chip">
              <CalendarIcon /> Дедлайн: {dueDate}
            </span>
          )
        )}
        {duration && (
          <span className="mgr-stat-chip">
            <ClockIcon /> {duration}
          </span>
        )}
        {medalTier(enrollment.scorePercent) && (
          <span className="mgr-stat-chip mgr-medal-chip" title={`${enrollment.scorePercent}% — медаль`}>
            <MedalIcon tier={medalTier(enrollment.scorePercent) ?? undefined} />
          </span>
        )}
      </div>
      {/* Курс -> модулі: видно, який САМЕ модуль складено. Колонки бал /
          медаль — у КОЖНОМУ рядку, якщо є хоч в одному, інакше значення
          різних рядків з'їжджали. */}
      {enrollment.modules && enrollment.modules.length > 0 && (
        <ul className="mgr-module-list">
          {enrollment.modules.map((m, _i, all) => (
            <li key={m.id} className={`mgr-module-row${m.passed === true ? " is-pass" : m.passed === false ? " is-fail" : " is-pending"}`}>
              <span className="mgr-module-status-icon">
                {m.passed === true ? <CheckIcon /> : m.passed === false ? <XIcon /> : <span className="mgr-module-dot" aria-hidden="true" />}
              </span>
              <span className="mgr-module-title">{m.title}</span>
              {all.some((x) => x.scorePercent != null) && (
                <span className="mgr-module-score">{m.scorePercent != null ? `${m.scorePercent}%` : ""}</span>
              )}
              {all.some((x) => medalTier(x.scorePercent)) && (
                <span className="mgr-module-medal" title={medalTier(m.scorePercent) ? `${m.scorePercent}% — медаль за модуль` : undefined}>
                  {medalTier(m.scorePercent) && <MedalIcon tier={medalTier(m.scorePercent) ?? undefined} />}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {(hasHistory || remindRecipient) && (
        <div className="mgr-attempts">
          <div className="mgr-enrollment-actions">
            {hasHistory && (
              <button type="button" className="admin-btn-link" onClick={() => setShowAttempts((v) => !v)}>
                {showAttempts ? "Сховати історію спроб" : `Історія спроб (${enrollment.attempts!.length})`}
              </button>
            )}
            {remindRecipient && (unfinished || failed) && (
              <RemindButton
                recipients={[remindRecipient]}
                courseId={enrollment.course.id}
                courseTitle={enrollment.course.title}
                reason={reason}
                dueDateLabel={dueDate}
              />
            )}
            {remindRecipient && passed && (
              <RemindButton recipients={[remindRecipient]} courseId={enrollment.course.id} courseTitle={enrollment.course.title} mode="praise" />
            )}
          </div>
          {showAttempts && enrollment.attempts && (
            <ul className="mgr-attempts-list">
              {enrollment.attempts.map((a) => (
                <li key={a.id} className="mgr-attempts-item">
                  <span>{formatDate(a.completedAt)}</span>
                  <span>{a.scorePercent}% балів</span>
                  <span>{formatDuration(a.durationSeconds)}</span>
                  <StatusBadge passed={Boolean(a.passed)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
