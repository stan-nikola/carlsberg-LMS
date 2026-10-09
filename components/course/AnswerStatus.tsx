import type { AnswerState } from "@/lib/grading";

/**
 * Відповідь ще без вердикту: пішла на сервер або дана без мережі
 * (lib/grading.ts AnswerState). Спільний для всіх оцінюваних типів —
 * quiz, hotspot, ordering, matching.
 */
export function AnswerStatus({ answer }: { answer?: AnswerState | null }) {
  // Перевірка триває частку секунди — видно її саму («крапля» на кружечку,
  // кнопці чи піні, course-player.css .is-checking), текст — лише для
  // програм читання екрана.
  if (answer?.status === "checking") {
    return (
      <div className="q-visually-hidden" role="status">
        Перевіряємо відповідь
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
