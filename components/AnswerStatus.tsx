import type { AnswerState } from "@/lib/grading";
import { SpinnerIcon } from "@/components/icons";

/**
 * Відповідь ще без вердикту: пішла на сервер або дана без мережі
 * (lib/grading.ts AnswerState). Спільний для всіх оцінюваних типів —
 * quiz, hotspot, ordering, matching.
 */
export function AnswerStatus({ answer, quiet = false }: { answer?: AnswerState | null; quiet?: boolean }) {
  // Перевірка триває частку секунди — текст лише блимав би. Видно маленький
  // спінер (у тесті — у кружечку обраного варіанта, тоді тут quiet), текст —
  // лише для програм читання екрана.
  if (answer?.status === "checking") {
    if (quiet) return null;
    return (
      <div className="q-checking" role="status">
        <SpinnerIcon />
        <span className="q-visually-hidden">Перевіряємо відповідь</span>
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
