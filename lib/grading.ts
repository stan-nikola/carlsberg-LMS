/**
 * Перевірка відповідей на оцінювані компоненти (quiz / hotspot / ordering /
 * matching) — ЄДИНЕ місце, де вирішується «правильно чи ні» (2026-09-27,
 * аудит безпеки S-C1).
 *
 * До цього правильність рахував браузер, а в сторінку плеєра приїжджав
 * повний content із `options[].correct`, правильним порядком кроків і
 * зонами на фото, — будь-хто міг прочитати відповіді або надіслати
 * серверу «100%». Тепер:
 *   publicContent  — що бачить плеєр ДО відповіді: без ключів, елементи
 *                    під непрозорими key (індекс не видає правильний порядок);
 *   gradeResponse  — перевірка сирої відповіді людини;
 *   revealContent  — розбір ПІСЛЯ відповіді: правильні варіанти, пояснення.
 *
 * Модуль чистий: `keyOf` передає викликач. Сервер дає HMAC-ключі
 * (lib/courseGrading.ts), прев'ю конструктора — просто індекси
 * (indexKeyOf): там автор і так бачить весь вміст.
 */

import { isHotspotHit } from "@/lib/componentTypes";

export type KeyOf = (kind: "o" | "s" | "l" | "r", index: number) => string;

/** Прохідний бал курсу за замовчуванням — той самий, що @default(80) у Course.passThreshold. */
export const DEFAULT_PASS_THRESHOLD = 80;

/**
 * Бал у відсотках. 100% — лише коли правильні ВСІ відповіді: звичайне
 * округлення давало 100 за 199 з 200, а 100% — це планка сертифіката
 * (lib/progress.ts certificateEarned, рішення користувача 2026-10-09).
 * Модуль без питань (лише матеріал) нікого не блокує — 100%.
 */
export function scorePercentOf(scoreRaw: number, scoreMax: number): number {
  if (scoreMax <= 0 || scoreRaw >= scoreMax) return 100;
  return Math.min(99, Math.round((scoreRaw / scoreMax) * 100));
}

export const indexKeyOf: KeyOf = (kind, index) => `${kind}${index}`;

type Obj = Record<string, unknown>;
type QuizOption = { text?: string; correct?: boolean; explanation?: string };
type Step = { text?: string };
type Pair = { left?: string; right?: string };

export type QuizResponse = { selected: string[] };
export type OrderingResponse = { order: string[] };
export type MatchingResponse = { links: Record<string, string> };
export type HotspotResponse = { x: number; y: number; aspect: number };
export type GradeResponse = QuizResponse | OrderingResponse | MatchingResponse | HotspotResponse;

/** Детермінований генератор [0,1) від рядка (FNV-1a → mulberry32). */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Перемішування, що гарантовано НЕ збігається з вихідним порядком (для 2+ елементів). */
function derange<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((item, i) => item === items[i])) out.reverse();
  return out;
}

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function without(content: Obj, ...keys: string[]): Obj {
  const out = { ...content };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Вміст для плеєра до відповіді. `__public: true` — маркер: компонент
 * питання за ним розуміє, що перевіряти сам не може й чекає розбір від
 * батька (CoursePlayer → сервер).
 */
export function publicContent(type: string, content: Obj | null | undefined, keyOf: KeyOf, seed: string): Obj {
  const c = content || {};
  const rand = seededRandom(seed);
  switch (type) {
    case "quiz":
      return {
        ...without(c, "options", "explanation"),
        options: arr<QuizOption>(c.options).map((o, i) => ({ key: keyOf("o", i), text: o.text ?? "" })),
        __public: true,
      };
    case "ordering": {
      const items = arr<Step>(c.items).map((s, i) => ({ key: keyOf("s", i), text: s.text ?? "" }));
      return { ...without(c, "items", "explanation"), items: derange(items, rand), __public: true };
    }
    case "matching": {
      const pairs = arr<Pair>(c.pairs);
      return {
        ...without(c, "pairs", "explanation"),
        lefts: pairs.map((p, i) => ({ key: keyOf("l", i), text: p.left ?? "" })),
        rights: derange(
          pairs.map((p, i) => ({ key: keyOf("r", i), text: p.right ?? "" })),
          rand
        ),
        __public: true,
      };
    }
    case "hotspot":
      return { ...without(c, "zones", "explanation"), __public: true };
    default:
      return c;
  }
}

/** Розбір після відповіді — у тих самих key, що й publicContent. */
export function revealContent(type: string, content: Obj | null | undefined, keyOf: KeyOf): Obj {
  const c = content || {};
  const explanation = typeof c.explanation === "string" ? c.explanation : undefined;
  switch (type) {
    case "quiz":
      return {
        explanation,
        options: arr<QuizOption>(c.options).map((o, i) => ({
          key: keyOf("o", i),
          text: o.text ?? "",
          correct: o.correct === true,
          explanation: o.explanation || undefined,
        })),
      };
    case "ordering":
      return { explanation, items: arr<Step>(c.items).map((s, i) => ({ key: keyOf("s", i), text: s.text ?? "" })) };
    case "matching":
      return {
        explanation,
        pairs: arr<Pair>(c.pairs).map((p, i) => ({ leftKey: keyOf("l", i), rightKey: keyOf("r", i), left: p.left ?? "", right: p.right ?? "" })),
      };
    case "hotspot":
      return { explanation, zones: arr(c.zones) };
    default:
      return {};
  }
}

/**
 * Розбір, який бачить людина. Повний — лише після ПРАВИЛЬНОЇ відповіді.
 * Після помилки правильний варіант/порядок/пари/зони не розкриваються:
 * інакше «провалив навмання → побачив відповіді → переклав на 100%» давало
 * сертифікат без знання матеріалу. Лишається тільки пояснення до обраного
 * варіанта в тесті з одним правильним (у кількох — і воно підказало б, які
 * з обраних були вірні).
 */
export function revealFor(type: string, content: Obj | null | undefined, keyOf: KeyOf, correct: boolean, response: unknown): Obj {
  if (correct) return revealContent(type, content, keyOf);
  const c = content || {};
  if (type !== "quiz" || c.questionType === "multi") return {};
  const selected = arr<string>(((response || {}) as Obj).selected);
  return {
    options: arr<QuizOption>(c.options).flatMap((o, i) => {
      const key = keyOf("o", i);
      return selected.includes(key) && o.correct !== true ? [{ key, text: o.text ?? "", correct: false, explanation: o.explanation || undefined }] : [];
    }),
  };
}

/** Чи правильна сира відповідь. Невалідна/чужа форма відповіді — false, не виняток. */
export function gradeResponse(type: string, content: Obj | null | undefined, response: unknown, keyOf: KeyOf): boolean {
  const c = content || {};
  const r = (response || {}) as Obj;
  switch (type) {
    case "quiz": {
      const selected = arr<string>(r.selected);
      const correct = arr<QuizOption>(c.options).flatMap((o, i) => (o.correct === true ? [keyOf("o", i)] : []));
      return correct.length > 0 && selected.length === correct.length && correct.every((k) => selected.includes(k));
    }
    case "ordering": {
      const order = arr<string>(r.order);
      const steps = arr<Step>(c.items);
      return steps.length > 0 && order.length === steps.length && steps.every((_, i) => order[i] === keyOf("s", i));
    }
    case "matching": {
      const links = (r.links && typeof r.links === "object" ? r.links : {}) as Record<string, unknown>;
      const pairs = arr<Pair>(c.pairs);
      return pairs.length > 0 && pairs.every((_, i) => links[keyOf("l", i)] === keyOf("r", i));
    }
    case "hotspot":
      return isHotspotHit({ x: Number(r.x), y: Number(r.y) }, arr(c.zones), Number(r.aspect));
    default:
      return false;
  }
}

/**
 * Прев'ю конструктора / курсу в /admin: повний вміст на руках, перевіряємо
 * локально, але ТИМ САМИМ кодом і в тих самих key, що й сервер, — прев'ю не
 * може розійтись із тим, що побачить співробітник.
 */
export function gradeLocally(type: string, content: Obj | null | undefined, response: unknown) {
  const correct = gradeResponse(type, content, response, indexKeyOf);
  return { correct, reveal: revealFor(type, content, indexKeyOf, correct, response), response };
}

export function isPublicContent(content: unknown): boolean {
  return Boolean(content && typeof content === "object" && (content as Obj).__public === true);
}

/**
 * Стан відповіді на питання в плеєрі:
 *  { status: "checking", response }        — відповідь пішла на сервер;
 *  { correct, reveal, response }           — перевірено (сервером або локально в прев'ю);
 *  { pending: true, response }             — дано без мережі, перевірка при синхронізації.
 */
export type AnswerState = {
  status?: "checking";
  correct?: boolean;
  pending?: boolean;
  response?: unknown;
  reveal?: Obj | null;
};

export function isAnswerDone(answer: AnswerState | null | undefined): boolean {
  return Boolean(answer) && (typeof answer!.correct === "boolean" || answer!.pending === true);
}

/** Вміст для показу: у плеєрі він уже публічний, у прев'ю — робимо таким самим (стабільний порядок від id). */
export function viewContent(type: string, content: Obj | null | undefined, componentId: number | string): Obj {
  return isPublicContent(content) ? (content as Obj) : publicContent(type, content, indexKeyOf, String(componentId));
}

/**
 * Відповідь із компонента питання. Прев'ю (повний вміст на руках) перевіряє
 * одразу тим самим gradeResponse; плеєр (публічний вміст) віддає сиру
 * відповідь нагору — CoursePlayer шле її на сервер.
 */
export function answerFor(type: string, content: Obj | null | undefined, response: unknown): AnswerState {
  return isPublicContent(content) ? { response } : gradeLocally(type, content, response);
}
