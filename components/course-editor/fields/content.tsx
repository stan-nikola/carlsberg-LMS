"use client";

import { ListRowControls, useListOps } from "@/components/course-editor/ListEditor";
import { HintDot } from "@/components/ui/HintDot";
import { ImageListEditor } from "@/components/course-editor/media";
import { OptionListEditor, RichTextArea, ScreenHeaderFields, GateMsgField, fieldSetter } from "@/components/course-editor/fields/common";
import type { Content, FieldProps } from "@/components/course-editor/types";

const emptyContent = {
  info: { kicker: "", lead: "", body: "", note: "", images: [] },
  quiz: { questionType: "single", options: [] },
};

export function InfoFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c: Content = { ...emptyContent.info, ...content, images: content.images || [] };
  const set = fieldSetter(c, onChange);

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Рубрика (kicker)</label>
        <input value={c.kicker} onChange={(e) => set("kicker")(e.target.value)} placeholder="Наприклад: ПРО КОМПАНІЮ" className="admin-input-flex" />
      </div>
      <div className="admin-field">
        <label className="admin-label">Вступний рядок (lead)</label>
        <RichTextArea value={c.lead} onChange={set("lead")} rows={2} paragraphs={false} />
      </div>
      {/* Зображення ПЕРЕД текстом екрану — рівно в тому порядку, в якому
          блок збирається на самому екрані (components/course/player/CoursePlayer.tsx
          InfoScreen: kicker → title → lead → mediaNode → textNode). Раніше
          поле фото стояло останнім, і порядок полів у конструкторі не
          збігався з тим, що автор бачив у прев'ю. */}
      <ImageListEditor images={c.images} onChange={set("images")} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        {/* Підказку про зірочки замінено кнопками: тепер розмітку не
            треба пам'ятати й набирати руками — виділив і натиснув. Сам
            синтаксис нікуди не подівся й лишається в title кнопки, бо
            текст можна правити й напряму. */}
        <label className="admin-label">Текст екрану</label>
        <RichTextArea value={c.body} onChange={set("body")} rows={5} />
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Підказка «Варто знати» <span className="admin-hint">— розгортається по кліку (акордеон), не видима одразу</span>
        </label>
        <RichTextArea value={c.note} onChange={set("note")} rows={2} />
      </div>
    </>
  );
}

export function QuizFields({ content, onChange, radioGroupName, onUploadingChange }: FieldProps & { radioGroupName: string }) {
  const c: Content = { ...emptyContent.quiz, ...content, options: content.options || [] };
  const set = fieldSetter(c, onChange);

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Тип питання</label>
        <div className="admin-radio-group">
          <label className="admin-radio">
            <input type="radio" name={radioGroupName} checked={c.questionType === "single"} onChange={() => set("questionType")("single")} />
            <span>одна правильна відповідь</span>
          </label>
          <label className="admin-radio">
            <input type="radio" name={radioGroupName} checked={c.questionType === "multi"} onChange={() => set("questionType")("multi")} />
            <span>декілька правильних</span>
          </label>
        </div>
      </div>
      {/* Фото між питанням і варіантами — питання може спиратись саме
          на зображення («що не так на цій викладці?»). */}
      <ImageListEditor images={c.images || []} onChange={set("images")} onUploadingChange={onUploadingChange} />
      <OptionListEditor options={c.options} onChange={set("options")} />
      <div className="admin-field">
        <label className="admin-checkbox">
          {/* !== false, а не === true: питання, створені до появи поля,
              мусять перемішуватись — так поводився legacy-курс. */}
          <input
            type="checkbox"
            checked={c.shuffleOptions !== false}
            onChange={(e) => set("shuffleOptions")(e.target.checked)}
          />
          <span>Перемішувати варіанти</span>
          <HintDot
            align="start"
            text="Порядок варіантів змінюється при кожному показі. Курси пересдають, і без перемішування з другого разу запам'ятовується позиція правильної відповіді, а не сама відповідь. Вимкніть, якщо варіанти мають стояти в конкретному порядку (наприклад «усі перелічені вище»)."
          />
        </label>
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Пояснення до відповіді{" "}
          <span className="admin-hint">— показується ПІСЛЯ відповіді, і правильної теж</span>
        </label>
        <RichTextArea
          value={c.explanation}
          onChange={set("explanation")}
          rows={2}
          paragraphs={false}
          placeholder="Чому саме так — коротко, одним-двома реченнями"
        />
      </div>
    </>
  );
}

/**
 * Рядок списку з кнопками "вгору/вниз/видалити". Порядок тут — це
 * порядок, у якому співробітник побачить елементи, тому переставляти
 * треба прямо в конструкторі, а не перебиванням тексту між полями.
 */
export function AccordionFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c = { kicker: "", lead: "", gateMsg: "", ...content, items: content.items || [] };
  const set = fieldSetter(c, onChange);
  const ops = useListOps(c.items, set("items"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Картки <span className="admin-hint">— «Далі» відкриється, коли співробітник розгорне ВСІ</span>
        </label>
        {c.items.map((item: Content, i: number) => (
          <div className="admin-lesson-card" key={i}>
            <div className="admin-row">
              <input
                value={item.title || ""}
                onChange={(e) => ops.update(i, "title", e.target.value)}
                placeholder={`Заголовок картки ${i + 1}`}
                className="admin-input-flex admin-title-input"
              />
              <ListRowControls index={i} total={c.items.length} onMove={ops.move} onRemove={ops.remove} label="картку" />
            </div>
            <RichTextArea
              value={item.body}
              onChange={(v) => ops.update(i, "body", v)}
              rows={2}
              placeholder="Текст, який розкриється по кліку"
            />
          </div>
        ))}
        <button type="button" onClick={() => ops.add({ title: "", body: "" })} className="admin-btn-link" title="Додати ще одну картку-акордеон">
          + Додати картку
        </button>
      </div>
      <GateMsgField c={c} set={set} placeholder="Відкрийте всі картки, щоб продовжити" />
    </>
  );
}

export function ChecklistFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c = { kicker: "", lead: "", gateMsg: "", ...content, items: content.items || [] };
  const set = fieldSetter(c, onChange);
  const ops = useListOps(c.items, set("items"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Пункти чек-листа <span className="admin-hint">— «Далі» відкриється, коли позначено всі</span>
        </label>
        {c.items.map((item: Content, i: number) => (
          <div className="admin-row admin-option-row" key={i}>
            <input
              value={item.text || ""}
              onChange={(e) => ops.update(i, "text", e.target.value)}
              placeholder={`Пункт ${i + 1}`}
              className="admin-input-flex"
            />
            <ListRowControls index={i} total={c.items.length} onMove={ops.move} onRemove={ops.remove} label="пункт" />
          </div>
        ))}
        <button type="button" onClick={() => ops.add({ text: "" })} className="admin-btn-link" title="Додати ще один пункт чек-листа">
          + Додати пункт
        </button>
      </div>
      <GateMsgField c={c} set={set} placeholder="Позначте всі пункти чек-листа" />
    </>
  );
}

// Роль визначає і підпис, і бік/колір бульбашки. "me" — єдина ліворуч
// (це говорить сам співробітник), решта співрозмовників праворуч.
// Значення мають збігатися з BUBBLE_LABELS у components/course/screens/ScriptScreen.tsx і
// класами .bubble.* у course-player.css.
const BUBBLE_ROLES = [
  { value: "me", label: "Ви кажете" },
  { value: "client", label: "Клієнт" },
  { value: "manager", label: "Керівник" },
  { value: "colleague", label: "Колега" },
  { value: "tip", label: "Порада" },
  { value: "note", label: "Ремарка" },
];

export function ScriptFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c = { kicker: "", lead: "", gateMsg: "", callLabel: "Дзвінок із клієнтом", ...content, bubbles: content.bubbles || [] };
  const set = fieldSetter(c, onChange);
  const ops = useListOps(c.bubbles, set("bubbles"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">Підпис у шапці дзвінка</label>
        <input value={c.callLabel} onChange={(e) => set("callLabel")(e.target.value)} className="admin-input-flex" />
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Репліки <span className="admin-hint">— відкриваються по одній, з індикатором «друкує»; «Далі» — коли дочитано всі</span>
        </label>
        {c.bubbles.map((b: Content, i: number) => (
          <div className="admin-lesson-card" key={i}>
            <div className="admin-row">
              <select value={b.role || "me"} onChange={(e) => ops.update(i, "role", e.target.value)} className="admin-select">
                {BUBBLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {/* Власний підпис поверх ролі — для співрозмовника, якого
                  немає в списку ("Бариста", "Закупівельник"). Роль при
                  цьому лишається: вона задає бік і колір бульбашки. */}
              <input
                value={b.label || ""}
                onChange={(e) => ops.update(i, "label", e.target.value)}
                placeholder={`підпис — за замовчуванням «${BUBBLE_ROLES.find((r) => r.value === (b.role || "me"))?.label}»`}
                className="admin-input-flex"
              />
              <ListRowControls index={i} total={c.bubbles.length} onMove={ops.move} onRemove={ops.remove} label="репліку" />
            </div>
            <RichTextArea
              value={b.text}
              onChange={(v) => ops.update(i, "text", v)}
              rows={2}
              paragraphs={false}
              placeholder={`Текст репліки ${i + 1}`}
            />
          </div>
        ))}
        <button type="button" onClick={() => ops.add({ role: "me", text: "" })} className="admin-btn-link" title="Додати ще одну репліку діалогу">
          + Додати репліку
        </button>
      </div>
      <GateMsgField c={c} set={set} placeholder="Дочитайте діалог до кінця" />
    </>
  );
}

export function TimelineFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c = { kicker: "", lead: "", gateMsg: "", highlight: null, ...content, steps: content.steps || [] };
  const set = fieldSetter(c, onChange);
  const ops = useListOps(c.steps, set("steps"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Кроки <span className="admin-hint">— «Далі» відкриється, коли торкнулись кожного</span>
        </label>
        {c.steps.map((step: Content, i: number) => (
          <div className="admin-lesson-card" key={i}>
            <div className="admin-row">
              <input
                value={step.title || ""}
                onChange={(e) => ops.update(i, "title", e.target.value)}
                placeholder={`Назва кроку ${i + 1}`}
                className="admin-input-flex admin-title-input"
              />
              <ListRowControls index={i} total={c.steps.length} onMove={ops.move} onRemove={ops.remove} label="крок" />
            </div>
            <RichTextArea
              value={step.detail}
              onChange={(v) => ops.update(i, "detail", v)}
              rows={2}
              placeholder="Суть кроку — розкриється по кліку"
            />
          </div>
        ))}
        <button type="button" onClick={() => ops.add({ title: "", detail: "" })} className="admin-btn-link" title="Додати ще один крок таймлайна">
          + Додати крок
        </button>
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Режим «ви тут»{" "}
          <span className="admin-hint">
            — підсвітити один крок як поточний; тоді для переходу далі досить торкнутись саме його (нагадування карти візиту між
            модулями)
          </span>
        </label>
        <select
          value={c.highlight || ""}
          onChange={(e) => set("highlight")(e.target.value ? Number(e.target.value) : null)}
          className="admin-select"
          style={{ width: "100%" }}
        >
          <option value="">— звичайний таймлайн, треба відкрити всі —</option>
          {c.steps.map((step: Content, i: number) => (
            <option key={i} value={i + 1}>
              Крок {i + 1}
              {step.title ? ` · ${step.title}` : ""}
            </option>
          ))}
        </select>
      </div>
      <GateMsgField c={c} set={set} placeholder="Торкніться кожного кроку" />
    </>
  );
}

/** Екран "фото та відео" — ті самі текстові поля, що в info (рубрика,
 *  вступний рядок, «Варто знати»), але без «Тексту екрану»: довга стаття
 *  під фото — це вже інфо-екран, а не показ одного знімка чи ролика.
 *  Порядок полів збігається з порядком на екрані співробітника.
 *
 *  Відео дозволене ЛИШЕ тут: у питанні (quiz, hotspot, ordering) ролик
 *  означав би, що відповідь треба спершу додивитись, а гейта «переглянув»
 *  у системі немає. */
export function PhotoFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c = { kicker: "", lead: "", note: "", ...content, images: content.images || [] };
  const set = fieldSetter(c, onChange);
  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Рубрика (kicker)</label>
        <input value={c.kicker} onChange={(e) => set("kicker")(e.target.value)} placeholder="Наприклад: ЯК ЦЕ ВИГЛЯДАЄ" className="admin-input-flex" />
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Вступний рядок (lead) <span className="admin-hint">— що саме показано і на що дивитись</span>
        </label>
        <RichTextArea value={c.lead} onChange={set("lead")} rows={2} paragraphs={false} />
      </div>
      <ImageListEditor images={c.images} onChange={set("images")} onUploadingChange={onUploadingChange} allowVideo />
      <div className="admin-field">
        <label className="admin-label">
          Підказка «Варто знати» <span className="admin-hint">— розгортається по кліку (акордеон), не видима одразу</span>
        </label>
        <RichTextArea value={c.note} onChange={set("note")} rows={2} />
      </div>
    </>
  );
}
