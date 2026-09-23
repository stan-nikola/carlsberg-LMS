"use client";

import { useEffect, useRef, useState } from "react";
import { managerReminderText } from "@/lib/notificationLogic";
import { SpinnerIcon } from "@/components/icons";

export type ReminderRecipient = { id: number; name: string };
export type ReminderReason = "overdue" | "behind" | "not_started" | "inactive" | "on_track" | "general";

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
}: {
  open: boolean;
  onClose: () => void;
  recipients: ReminderRecipient[];
  courseId: number | null;
  courseTitle: string | null;
  reason: ReminderReason;
  dueDateLabel: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setMessage(managerReminderText(reason === "on_track" ? "general" : reason, courseTitle, dueDateLabel));
      setResult(null);
      setError("");
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, reason, courseTitle, dueDateLabel]);

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
      const res = await fetch("/api/manager/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: recipients.map((r) => r.id), courseId, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <h2 className="mgr-reminder-title">Нагадати</h2>
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
            <button type="button" className="btn btn-primary mgr-reminder-send" onClick={send} disabled={busy || !message.trim()}>
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
  label = "Нагадати",
  className = "admin-btn-link",
  disabled = false,
}: {
  recipients: ReminderRecipient[];
  courseId?: number | null;
  courseTitle?: string | null;
  reason?: ReminderReason;
  dueDateLabel?: string | null;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled || recipients.length === 0}>
        {label}
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
        />
      )}
    </>
  );
}
