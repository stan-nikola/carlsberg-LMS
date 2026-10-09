// Дані конструктора — те, що віддає GET /api/admin/courses/:id (Course →
// Module → Screen → Component), у тій формі, в якій їх тримає стан редактора.

/** Component.content — JSON, форма залежить від типу (lib/componentTypes.js
 *  defaultContentForType); поля кожного типу читає його *Fields-редактор. */
export type Content = Record<string, any>;

export type EditorComponent = {
  id: number;
  type: string;
  title: string | null;
  order: number;
  content: Content;
};

export type EditorScreen = {
  id: number;
  title: string;
  order: number;
  components: EditorComponent[];
};

export type EditorModule = {
  id: number;
  title: string;
  order: number;
  cooldownDays: number | null;
  retakeCooldownDays: number | null;
  questionPoolSize: number | null;
  retryFreeAttempts: number | null;
  retryCooldownHours: number | null;
  screens: EditorScreen[];
};

export type EditorCourse = {
  id: number;
  slug: string;
  title: string;
  previewDevice: string;
  modulePauseDays: number | null;
  passThreshold: number;
  modules: EditorModule[];
  [field: string]: unknown;
};

/** Форма правки компонента віддає батькові збереження перед переходом. */
export type SaveHandle = { save: () => Promise<boolean>; isDirty: boolean };

/** Чернетка компонента з форми — для живої прев'ю. */
export type LiveComponent = Pick<EditorComponent, "id" | "title" | "type" | "content">;

/** Частка правильних відповідей по питанню (GET …/question-stats). */
export type QuestionStats = Record<number, { pct: number }>;

/** Пропси редактора полів одного типу компонента. */
export type FieldProps = {
  content: Content;
  onChange: (next: Content) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

/** Варіант відповіді quiz. */
export type QuizOption = { text: string; correct: boolean; explanation?: string };

/** Фото/відео у списку медіа екрана. */
export type MediaItem = { url: string; kind?: string; [field: string]: unknown };
