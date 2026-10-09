"use client";

import { useEffect, useRef } from "react";
import { HintDot } from "@/components/HintDot";
import { ImageListEditor } from "@/components/course-editor/media";
import type { Content, QuizOption } from "@/components/course-editor/types";

/** Сеттер поля контенту: set("lead")(value). */
export type FieldSetter = (field: string) => (value: any) => void;

export const fieldSetter =
  (c: Content, onChange: (next: Content) => void): FieldSetter =>
  (field) =>
  (value) =>
    onChange({ ...c, [field]: value });

export function OptionListEditor({ options, onChange }: { options: QuizOption[]; onChange: (next: QuizOption[]) => void }) {
  function updateOption(index: number, field: keyof QuizOption, value: string | boolean) {
    const next = options.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt));
    onChange(next);
  }
  function removeOption(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }
  function addOption() {
    onChange([...options, { text: "", correct: false, explanation: "" }]);
  }

  /** Пресет «Правда / Неправда» — не окремий тип компонента, а два готові
   *  варіанти: для співробітника це той самий вибір одного варіанта, тож
   *  дублювати заради нього редактор і рендер немає сенсу. */
  function makeTrueFalse() {
    if (options.some((o) => o.text.trim()) && !confirm("Замінити наявні варіанти на «Правда» і «Неправда»?")) return;
    onChange([
      { text: "Правда", correct: true, explanation: "" },
      { text: "Неправда", correct: false, explanation: "" },
    ]);
  }

  return (
    <div className="admin-field">
      <label className="admin-label">
        Варіанти відповіді{" "}
        <HintDot
          align="start"
          text="Позначте галочкою всі правильні. Пояснення під варіантом показується співробітнику ПІСЛЯ відповіді: у невірного — чому він невірний, у правильного — чому саме він. Це впливає на запам'ятовування сильніше за формат питання, тому варто заповнювати хоча б у невірних варіантів, які обирають найчастіше."
        />
      </label>
      {options.map((opt, i) => (
        <div className="admin-option-block" key={i}>
          <div className="admin-row admin-option-row">
            <label className="admin-checkbox">
              <input type="checkbox" checked={opt.correct} onChange={(e) => updateOption(i, "correct", e.target.checked)} />
              <span>правильний</span>
            </label>
            <input
              placeholder="Текст варіанту"
              value={opt.text}
              onChange={(e) => updateOption(i, "text", e.target.value)}
              className="admin-input-flex"
            />
            <button type="button" onClick={() => removeOption(i)} className="admin-icon-btn" aria-label="Видалити варіант" title="Видалити цей варіант відповіді">
              ✕
            </button>
          </div>
          <input
            placeholder={opt.correct ? "Чому саме цей варіант правильний (необов'язково)" : "Чому цей варіант невірний (необов'язково)"}
            value={opt.explanation || ""}
            onChange={(e) => updateOption(i, "explanation", e.target.value)}
            className="admin-input-flex admin-option-explain"
          />
        </div>
      ))}
      <div className="admin-btn-group">
        <button type="button" onClick={addOption} className="admin-btn-link" title="Додати ще один варіант відповіді">
          + Додати варіант
        </button>
        <button type="button" onClick={makeTrueFalse} className="admin-btn-link" title="Замінити варіанти на «Правда» і «Неправда»">
          Правда / Неправда
        </button>
      </div>
    </div>
  );
}

/** Накреслення, доступні кнопками. Синтаксис має збігатись із тим, що
 *  реально рендерить lib/richText.jsx — інакше автор натисне кнопку, а
 *  співробітник побачить сирі зірочки. */
const RICH_MARKS = [
  { mark: "**", label: "Ж", title: "Жирний", css: { fontWeight: 800 } },
  { mark: "*", label: "К", title: "Курсив", css: { fontStyle: "italic" } },
  { mark: "__", label: "П", title: "Підкреслений", css: { textDecoration: "underline" } },
];

/**
 * Textarea з кнопками накреслень. Кнопка обгортає ВИДІЛЕНИЙ фрагмент, а
 * якщо нічого не виділено — вставляє порожню пару знаків і ставить
 * курсор між ними. Повторне натискання на вже обгорнутому фрагменті
 * знімає розмітку — інакше єдиним способом прибрати жирний було б
 * стирати зірочки руками.
 *
 * `paragraphs={false}` — для полів, які плеєр малює всередині рядкового
 * контейнера (вступний рядок, пояснення, репліка діалогу): там працюють
 * накреслення, але порожній рядок абзацу НЕ створює (lib/richText.jsx
 * renderRichMarks), тому й підказки про абзац там нема.
 *
 * Виділення відновлюється в useEffect по зміні value, а НЕ в
 * requestAnimationFrame одразу після onChange: rAF не прив'язаний до
 * коміту React і встигав спрацювати ще на старому значенні — курсор
 * після цього стрибав у кінець тексту (перевірено на живій сторінці).
 * Ефект же гарантовано йде після того, як textarea вже перемальована.
 */
export function RichTextArea({
  value,
  onChange,
  rows = 5,
  className = "admin-textarea",
  placeholder,
  paragraphs = true,
}: {
  value: string | undefined;
  onChange: (next: string) => void;
  rows?: number;
  className?: string;
  placeholder?: string;
  paragraphs?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  // Частина полів приходить як undefined (контент старих компонентів) —
  // без цього перше ж натискання кнопки падало б на value.slice.
  const text = value || "";

  useEffect(() => {
    const el = ref.current;
    const sel = pendingSelection.current;
    if (!el || !sel) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(sel[0], sel[1]);
  }, [value]);

  function applyMark(mark: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end);
    const wrapped = selected.length > mark.length * 2 && selected.startsWith(mark) && selected.endsWith(mark);

    const inner = wrapped ? selected.slice(mark.length, -mark.length) : selected;
    const next = wrapped
      ? text.slice(0, start) + inner + text.slice(end)
      : text.slice(0, start) + mark + selected + mark + text.slice(end);
    const selStart = wrapped ? start : start + mark.length;
    pendingSelection.current = [selStart, selStart + inner.length];
    onChange(next);
  }

  return (
    <>
      <div className="admin-richtext-toolbar">
        {RICH_MARKS.map((m) => (
          <button
            key={m.mark}
            type="button"
            className="admin-richtext-btn"
            style={m.css}
            title={`${m.title} — ${m.mark}текст${m.mark}`}
            aria-label={m.title}
            onClick={() => applyMark(m.mark)}
          >
            {m.label}
          </button>
        ))}
        {paragraphs && <span className="admin-hint admin-richtext-hint">порожній рядок = новий абзац</span>}
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
    </>
  );
}

/* ============ Конструктор інтерактивних екранів ============
   Механіки портовані з попередньої vanilla-JS розробки "8 кроків
   телесейлінгу" (див. lib/componentTypes.js). Спільне для всіх: рубрика +
   вступний рядок + власний список елементів, кожен з яких можна
   переставити/видалити, плюс необов'язковий текст-підказка гейта. */

/** Спільні поля-шапка (рубрика/вступ) — щоб не дублювати в кожному типі. */
export function ScreenHeaderFields({
  c,
  set,
  onUploadingChange,
  maxImages,
  imagesLimitHint,
}: {
  c: Content;
  set: FieldSetter;
  onUploadingChange?: (uploading: boolean) => void;
  maxImages?: number;
  imagesLimitHint?: string;
}) {
  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Рубрика (kicker)</label>
        <input
          value={c.kicker || ""}
          onChange={(e) => set("kicker")(e.target.value)}
          placeholder="Наприклад: КРОК 2 · ПРИВІТАННЯ КЛІЄНТА"
          className="admin-input-flex"
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Вступний рядок (lead)</label>
        <RichTextArea value={c.lead} onChange={set("lead")} rows={2} paragraphs={false} />
      </div>
      {/* Фото доступне КОЖНОМУ типу компонента, не лише інфо-блоку та
          "фото". Стоїть одразу після вступного рядка — там само, де в
          інфо-блоці, і там само, де плеєр його малює: порядок полів у
          конструкторі збігається з порядком на екрані. */}
      <ImageListEditor images={c.images || []} onChange={set("images")} onUploadingChange={onUploadingChange} max={maxImages} limitHint={imagesLimitHint} />
    </>
  );
}

/** Текст, який співробітник бачить під кнопкою «Далі», поки екран заблокований. */
export function GateMsgField({ c, set, placeholder }: { c: Content; set: FieldSetter; placeholder?: string }) {
  return (
    <div className="admin-field">
      <label className="admin-label">
        Підказка, поки екран заблоковано{" "}
        <span className="admin-hint">— лишіть порожнім, щоб узяти стандартну для цього типу</span>
      </label>
      <input
        value={c.gateMsg || ""}
        onChange={(e) => set("gateMsg")(e.target.value)}
        placeholder={placeholder}
        className="admin-input-flex"
      />
    </div>
  );
}
