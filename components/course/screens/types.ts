import type { AnswerState } from "@/lib/grading";

/** Фото/відео екрана. */
export type MediaItem = { url: string; caption?: string; kind?: string; poster?: string };

/** Елемент списку екрана (картка акордеона, пункт чек-листа, крок, репліка, точка). */
export type ContentItem = Record<string, any>;

/** Component.content для плеєра — JSON, форма залежить від типу
 *  (lib/componentTypes.js). Спільні поля типізовані, решта — як є. */
export type ScreenContent = {
  kicker?: string;
  lead?: string;
  note?: string;
  images?: MediaItem[];
  items?: ContentItem[];
  steps?: ContentItem[];
  bubbles?: ContentItem[];
  pins?: ContentItem[];
  [field: string]: any;
};

export const EMPTY_CONTENT: ScreenContent = {};

export type PlayerComponent = { id: number; type?: string; title?: string | null; content?: ScreenContent | null };

export type ZoomImage = (img: { src: string; alt: string }) => void;

/** Пропси інтерактивного екрана. onGateProgress — скільки елементів уже
 *  «зроблено» (плеєр порівнює з gateTotal і розблоковує «Далі»). */
export type ScreenProps = {
  component: PlayerComponent;
  screenNumber?: number;
  onGateProgress?: (done: number) => void;
  onZoomImage?: ZoomImage;
  /** Методичка: усе відкрито, нічого не треба натискати. */
  readOnly?: boolean;
  tapHint?: boolean;
};

/** Оцінюваний екран: відповідь живе в плеєрі. */
export type QuestionScreenProps = {
  component: PlayerComponent;
  screenNumber?: number;
  answer?: AnswerState;
  onAnswer: (answer: AnswerState) => void;
  onZoomImage?: ZoomImage;
  /** Наскрізний номер питання в модулі: «Питання 3 з 8». */
  questionNumber?: number;
  questionTotal?: number;
};
