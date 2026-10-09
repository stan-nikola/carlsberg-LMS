/**
 * Підписи стану призначення (Enrollment) — одні для хабу, кабінету
 * керівника, адмінки, Excel-звіту й Telegram Mini App.
 *
 * `completed` саме по собі означає лише «дійшов до кінця», НЕ «склав»: чи
 * склав — окреме `passed`. Тому завершене завжди показуємо через
 * enrollmentStatusLabel(status, passed), а не напряму з мапи.
 */
export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  not_started: "Не розпочато",
  in_progress: "В процесі",
  overdue: "Прострочено",
  completed: "Завершено",
};

export function enrollmentStatusLabel(status: string, passed: boolean | null | undefined): string {
  if (status === "completed") return passed ? "Складено" : "Не складено";
  return ENROLLMENT_STATUS_LABELS[status] ?? status;
}
