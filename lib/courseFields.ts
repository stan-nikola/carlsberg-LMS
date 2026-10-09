import { DEFAULT_PASS_THRESHOLD } from "@/lib/grading";

type Body = Record<string, unknown>;

const intOrNull = (v: unknown) => (v === "" || v == null ? null : Number(v));
const textOrNull = (v: unknown) => (v ? String(v) : null);
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/**
 * Поля курсу з тіла запиту конструктора — одне приведення типів для
 * створення (POST /api/admin/courses) і правки (PATCH …/[courseId]). Лише ті
 * ключі, що прийшли: на PATCH відсутнє поле означає «не чіпати». Порожній
 * рядок у числовому полі — «не задано» (null).
 */
export function courseFieldsFromBody(body: Body) {
  const out: Record<string, unknown> = {};
  const map: Record<string, (v: unknown) => unknown> = {
    title: (v) => String(v),
    description: textOrNull,
    category: textOrNull,
    isMandatory: Boolean,
    deadlineDays: intOrNull,
    moduleDays: intOrNull,
    modulePauseDays: intOrNull,
    passThreshold: (v) => (v === "" || v == null ? DEFAULT_PASS_THRESHOLD : Number(v)),
    points: intOrNull,
    certificateEnabled: Boolean,
    assignOnFirstLogin: Boolean,
    // "phone"/"laptop" — лише прев'ю в конструкторі; застосунок співробітника
    // підлаштовується під реальний екран сам.
    previewDevice: (v) => (v === "laptop" ? "laptop" : "phone"),
    streakMessages: (v) => v || null,
    targetPositions: list,
    targetTerritories: list,
    targetEmployeeIds: list,
    folderId: intOrNull,
    publishAt: (v) => (v ? new Date(String(v)) : null),
  };
  for (const [key, convert] of Object.entries(map)) if (body[key] !== undefined) out[key] = convert(body[key]);
  return out;
}
