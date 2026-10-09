import type { AnswerState } from "@/lib/grading";
import type { PlayerComponent } from "@/components/course/screens/types";

/** Екран курсу, як його будує сторінка курсу (app/courses/[slug]/page.js). */
export type PlayerScreen = {
  id: number;
  title: string;
  moduleId: number;
  moduleTitle: string;
  components: PlayerComponent[];
};

/** Межі модуля в списку екранів сесії (0-based, включно). */
export type ModuleSegment = { moduleId: number; moduleTitle: string; startIdx: number; endIdx: number };

/** Відповіді за id компонента. */
export type Answers = Record<string, AnswerState>;

export type SavedProgress = { idx: number; answers: Answers; key: string };

/** Курс, яким сторінка курсу ініціалізує плеєр. */
export type PlayerCourse = {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  streakMessages?: unknown;
  passThreshold?: number | null;
  certificateEnabled?: boolean;
};

/** Бал модуля чи курсу; null — сервер ще не відповів. */
export type Score = { scoreRaw: number | null; scoreMax: number | null; scorePercent: number | null; passed: boolean | null };

/** «М'яке гальмо» перескладання (lib/retryPolicy.ts retryGate). */
export type RetryInfo = { canRetryNow: boolean; attemptsLeft?: number | null; waitLabel?: string };

/** Сесія закінчується раніше за курс: далі модуль під паузою. */
export type AfterSession = { moreModules?: boolean; notice?: string; pauseDays?: number; moduleTitle?: string };

export type ModuleCheckpoint = Partial<Score> & {
  moduleId: number;
  moduleTitle: string;
  saving: boolean;
  saveError: string | null;
  queued?: boolean;
  nextIdx: number;
  note: string | null | undefined;
  sessionEnd: boolean;
  retry?: RetryInfo | null;
};

export type CourseResult = Partial<Score> & {
  pointsEarned?: number;
  certificateEarned?: boolean;
  submitting?: boolean;
  submitError?: string | null;
  queued?: boolean;
};
