import type { AnswerState } from "@/lib/grading";

/**
 * Відповідь ще без вердикту: пішла на сервер або дана без мережі
 * (lib/grading.ts AnswerState). Спільний для всіх оцінюваних типів —
 * quiz, hotspot, ordering, matching.
 */
export function AnswerStatus({ answer }: { answer?: AnswerState | null }) {
  if (answer?.status === "checking") {
    return (
      <div className="q-fb show pending" role="status">
        <b className="q-fb-verdict">Перевіряємо відповідь…</b>
      </div>
    );
  }
  if (answer?.pending) {
    return (
      <div className="q-fb show pending" role="status">
        <b className="q-fb-verdict">Відповідь збережено</b>
        <span className="q-fb-explain">Немає зв&apos;язку — перевіримо, щойно з&apos;явиться мережа. Можна йти далі.</span>
      </div>
    );
  }
  return null;
}
