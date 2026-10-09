"use client";

import { useEffect, useRef, useState } from "react";
import { managerPraiseText, managerReminderText } from "@/lib/notificationLogic";
import { PaperPlaneIcon, SpinnerIcon } from "@/components/icons";
import { prefersReducedMotion } from "@/lib/motion";
import { api } from "@/lib/api";

export type ReminderRecipient = { id: number; name: string };
export type ReminderReason = "overdue" | "behind" | "not_started" | "inactive" | "failed" | "on_track" | "general";
/** «Нагадати» про недороблене або «Похвалити» за складене — один діалог,
 *  різний шаблон, заголовок і тип сповіщення на сервері. */
export type ReminderMode = "remind" | "praise";

/**
 * «Нагадати» з кабінету керівника: шаблон за причиною (керівник править
 * текст перед відправкою) → POST /api/manager/reminders → центр + push +
 * Telegram адресата. Нативний <dialog> — модалок у проєкті нема, а
 * showModal() дає фокус-пастку й Esc безкоштовно.
 */
export function ReminderDialog({
  open,
  onClose,
  recipients,
  courseId,
  courseTitle,
  reason,
  dueDateLabel,
  mode = "remind",
}: {
  open: boolean;
  onClose: () => void;
  recipients: ReminderRecipient[];
  courseId: number | null;
  courseTitle: string | null;
  reason: ReminderReason;
  dueDateLabel: string | null;
  mode?: ReminderMode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null);
  // Паперовий літачок (як у Telegram): після відповіді сервера вилітає з
  // кнопки «Надіслати» (координати — до того, як кнопка зникне з результатом).
  // position:fixed усередині <dialog> (top layer) — над підкладкою.
  const sendRef = useRef<HTMLButtonElement>(null);
  const [plane, setPlane] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setMessage(
        mode === "praise" ? managerPraiseText(courseTitle) : managerReminderText(reason === "on_track" ? "general" : reason, courseTitle, dueDateLabel)
      );
      setResult(null);
      setError("");
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, reason, courseTitle, dueDateLabel, mode]);

  // Esc / закриття ззовні — нативна подія close; слухаємо напряму, а не
  // через JSX-проп: інакше стан `open` лишався true після Esc і наступний
  // клік по «Нагадати» нічого не відкривав (спіймано живим тестом).
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onClose]);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/manager/reminders", { method: "POST", body: { employeeIds: recipients.map((r) => r.id), courseId, message, kind: mode } });
      // Летить на КОЖНЕ «Надіслати», а не лише коли sent > 0 (користувач,
      // 2026-10-04): повтор того ж дня сервер не доставляє вдруге (dedupe), і
      // без літачка здавалось, що кнопка не спрацювала. Що саме дійшло — каже
      // рядок результату нижче («вже отримали сьогодні»).
      const rect = sendRef.current?.getBoundingClientRect();
      if (rect && !prefersReducedMotion()) {
        setPlane({ left: rect.left + rect.width / 2 - 14, top: rect.top + rect.height / 2 - 14 });
      }
      setResult({ sent: data.sent, skipped: data.skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося надіслати.");
    } finally {
      setBusy(false);
    }
  }

  const names = recipients.map((r) => r.name);
  const who = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} і ще ${names.length - 3}`;

  return (
    <dialog ref={ref} className="mgr-reminder-dialog">
      {plane && (
        <span className="mgr-plane" style={plane} aria-hidden="true" onAnimationEnd={() => setPlane(null)}>
          <PaperPlaneIcon />
        </span>
      )}
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2 className="mgr-reminder-title">{mode === "praise" ? "Похвалити" : "Нагадати"}</h2>
        <p className="admin-hint mgr-reminder-who">
          Кому: {who}
          {courseTitle ? ` · курс «${courseTitle}»` : ""}
        </p>
        {result ? (
          <p className="mgr-reminder-result">
            Надіслано: {result.sent}
            {result.skipped > 0 ? ` · вже отримали сьогодні: ${result.skipped}` : ""}
          </p>
        ) : (
          <textarea
            className="admin-input mgr-reminder-text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={500}
            disabled={busy}
            aria-label="Текст нагадування"
          />
        )}
        {error && <p className="admin-hint mgr-reminder-error">{error}</p>}
        <div className="mgr-reminder-actions">
          <button type="button" className="admin-btn-link" onClick={onClose} disabled={busy}>
            {result ? "Закрити" : "Скасувати"}
          </button>
          {!result && (
            <button ref={sendRef} type="button" className="btn btn-primary mgr-reminder-send" onClick={send} disabled={busy || !message.trim()}>
              {busy ? <SpinnerIcon /> : "Надіслати"}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

/** Кнопка, що відкриває діалог — одна на список уваги, картку людини й рядок курсу. */
export function RemindButton({
  recipients,
  courseId = null,
  courseTitle = null,
  reason = "general",
  dueDateLabel = null,
  mode = "remind",
  label,
  className = "admin-btn-link",
  disabled = false,
}: {
  recipients: ReminderRecipient[];
  courseId?: number | null;
  courseTitle?: string | null;
  reason?: ReminderReason;
  dueDateLabel?: string | null;
  mode?: ReminderMode;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled || recipients.length === 0}>
        {label ?? (mode === "praise" ? "Похвалити" : "Нагадати")}
      </button>
      {open && (
        <ReminderDialog
          open={open}
          onClose={() => setOpen(false)}
          recipients={recipients}
          courseId={courseId}
          courseTitle={courseTitle}
          reason={reason}
          dueDateLabel={dueDateLabel}
          mode={mode}
        />
      )}
    </>
  );
}
