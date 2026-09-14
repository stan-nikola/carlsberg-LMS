"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ComponentScreen, QuizScreen, CoursePlayer } from "@/components/CoursePlayer";
import { HotspotScreen } from "@/components/ScreenComponents";
import { ChevronIcon, GripIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { pluralize } from "@/lib/pluralize";
import { COMPONENT_TYPES, COMPONENT_TYPE_LABELS, RETIRED_COMPONENT_TYPES, defaultContentForType, isScored } from "@/lib/componentTypes";
import { ListRowControls, useListOps } from "@/components/ListEditor";
import { HintDot } from "@/components/HintDot";
import { numberComponents } from "@/lib/coursePlayerLogic";

// Десктопний редактор контенту курсу.
//
// Зліва — акордеон Модуль -> Екран -> Компонент (кожен рівень згортається,
// щоб було видно структуру, а не суцільний список однаково виглядних
// заголовків) + форма правки ОДНОГО обраного компонента з кнопками "Далі"/
// "Назад" — так само, як співробітник проходить курс по кроках, а не
// довгою стрічкою всіх екранів одразу. Поки кожен Screen має рівно один
// Component (1:1 зі старою моделлю Lesson) — стек кількох компонентів на
// одному екрані додається окремим кроком.
//
// Справа — жива прев'ю з тим самим "хромом", що й реальний CoursePlayer
// (шапка з лічильником кроку, прогрес-бар, кнопки навігації внизу) — не
// просто InfoScreen/QuizScreen сам по собі, а повний вигляд мобільного
// екрану співробітника, щоб було видно ТОЧНО те, що побачить він.
//
// Налаштування курсу (посади/території, дата публікації, дедлайн) звідси
// прибрані — вони на дашборді /admin (components/AdminDashboard.jsx), при
// розгортанні курсу.

const emptyContent = {
  info: { kicker: "", lead: "", body: "", note: "", images: [] },
  quiz: { questionType: "single", options: [] },
};

// Не більше трьох фото на екран: далі вони на телефоні перетворюються на
// нескінченну стрічку, крізь яку треба гортати до тексту.
const MAX_IMAGES = 3;

function ImagePicker({ image, index, total, onChange, onMove, onRemove, onUploadingChange }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleFilePicked(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // щоб той самий файл можна було обрати повторно
    if (!file) return;

    setUploading(true);
    onUploadingChange?.(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });

      // Сервер міг впасти ДО того, як встиг сформувати JSON (мережева
      // помилка, обрив з'єднання) — тіло тоді порожнє, і res.json()
      // кидає незрозуміле "Unexpected end of JSON input" замість
      // реальної причини. Читаємо як текст і парсимо самі.
      const rawText = await res.text();
      const data = rawText ? JSON.parse(rawText) : {};

      if (!res.ok) {
        throw new Error(
          data.error === "not_configured"
            ? "Завантаження фото не налаштоване (BLOB_READ_WRITE_TOKEN)"
            : data.error || `Сервер не відповів (HTTP ${res.status})`
        );
      }
      onChange({ ...image, url: data.url });
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  return (
    <div className="admin-image-picker">
      {image.url && <img src={image.url} alt="" className="admin-image-preview" />}
      <div className="admin-row">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFilePicked}
        />
        <button
          type="button"
          className="admin-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Завантажити файл зображення з комп'ютера"
        >
          {uploading && <SpinnerIcon />}
          {uploading ? "Завантаження…" : "Обрати фото…"}
        </button>
        <input
          placeholder="або встав URL /assets/…"
          value={image.url}
          onChange={(e) => onChange({ ...image, url: e.target.value })}
          className="admin-input-flex admin-input-mono"
        />
        {/* Стрілки + видалення — той самий спільний ListRowControls, що й
            у решті списків конструктора (варіанти, пункти, кроки). Порядок
            фото тут — це порядок, у якому їх побачить співробітник, тому
            переставляти треба прямо тут, а не перезавантажувати файли. */}
        <ListRowControls index={index} total={total} onMove={onMove} onRemove={() => onRemove(index)} label="зображення" />
      </div>
      <p className="admin-hint">Формати: JPEG, PNG, WebP, GIF · до 8 МБ.</p>
      <input
        placeholder="підпис (необов'язково)"
        value={image.caption}
        onChange={(e) => onChange({ ...image, caption: e.target.value })}
        className="admin-input-flex"
      />
      {uploadError && <p className="admin-error">{uploadError}</p>}
    </div>
  );
}

function ImageListEditor({ images, onChange, onUploadingChange }) {
  // Скільки фото зараз вантажиться (за індексом) — Save блокується, поки
  // не 0, інакше можна зберегти екран з порожнім url (лист заповнення ще
  // не встиг прийти) — саме так з'являвся варнінг next/image про
  // порожній src і "фото не зберіглося".
  const uploadingIndicesRef = useRef(new Set());

  function reportUploading(index, isUploading) {
    if (isUploading) uploadingIndicesRef.current.add(index);
    else uploadingIndicesRef.current.delete(index);
    onUploadingChange?.(uploadingIndicesRef.current.size > 0);
  }

  const ops = useListOps(images, onChange);
  function updateImage(index, next) {
    onChange(images.map((img, i) => (i === index ? next : img)));
  }
  const atLimit = images.length >= MAX_IMAGES;

  return (
    <div className="admin-field">
      <label className="admin-label">
        Зображення <span className="admin-hint">— до {MAX_IMAGES}, порядок задають стрілки</span>
      </label>
      {images.map((img, i) => (
        <ImagePicker
          key={i}
          image={img}
          index={i}
          total={images.length}
          onChange={(next) => updateImage(i, next)}
          onMove={ops.move}
          onRemove={ops.remove}
          onUploadingChange={(isUploading) => reportUploading(i, isUploading)}
        />
      ))}
      {atLimit ? (
        <p className="admin-hint">Більше {MAX_IMAGES} фото на один екран не додати — заберіть зайве, щоб додати інше.</p>
      ) : (
        <button type="button" onClick={() => ops.add({ url: "", caption: "" })} className="admin-btn-link" title="Додати ще один слот під фото">
          + Додати зображення
        </button>
      )}
    </div>
  );
}

function OptionListEditor({ options, onChange }) {
  function updateOption(index, field, value) {
    const next = options.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt));
    onChange(next);
  }
  function removeOption(index) {
    onChange(options.filter((_, i) => i !== index));
  }
  function addOption() {
    onChange([...options, { text: "", correct: false }]);
  }

  return (
    <div className="admin-field">
      <label className="admin-label">Варіанти відповіді</label>
      {options.map((opt, i) => (
        <div className="admin-row admin-option-row" key={i}>
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
      ))}
      <button type="button" onClick={addOption} className="admin-btn-link" title="Додати ще один варіант відповіді">
        + Додати варіант
      </button>
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
 * Виділення відновлюється в useEffect по зміні value, а НЕ в
 * requestAnimationFrame одразу після onChange: rAF не прив'язаний до
 * коміту React і встигав спрацювати ще на старому значенні — курсор
 * після цього стрибав у кінець тексту (перевірено на живій сторінці).
 * Ефект же гарантовано йде після того, як textarea вже перемальована.
 */
function RichTextArea({ value, onChange, rows = 5, className = "admin-textarea" }) {
  const ref = useRef(null);
  const pendingSelection = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const sel = pendingSelection.current;
    if (!el || !sel) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(sel[0], sel[1]);
  }, [value]);

  function applyMark(mark) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const wrapped = selected.length > mark.length * 2 && selected.startsWith(mark) && selected.endsWith(mark);

    const inner = wrapped ? selected.slice(mark.length, -mark.length) : selected;
    const next = wrapped
      ? value.slice(0, start) + inner + value.slice(end)
      : value.slice(0, start) + mark + selected + mark + value.slice(end);
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
        <span className="admin-hint admin-richtext-hint">порожній рядок = новий абзац</span>
      </div>
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={className} />
    </>
  );
}

function InfoFields({ content, onChange, onUploadingChange }) {
  const c = { ...emptyContent.info, ...content, images: content.images || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Рубрика (kicker)</label>
        <input value={c.kicker} onChange={(e) => set("kicker")(e.target.value)} placeholder="Наприклад: ПРО КОМПАНІЮ" className="admin-input-flex" />
      </div>
      <div className="admin-field">
        <label className="admin-label">Вступний рядок (lead)</label>
        <textarea value={c.lead} onChange={(e) => set("lead")(e.target.value)} rows={2} className="admin-textarea" />
      </div>
      {/* Зображення ПЕРЕД текстом екрану — рівно в тому порядку, в якому
          блок збирається на самому екрані (components/CoursePlayer.jsx
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
        <textarea value={c.note} onChange={(e) => set("note")(e.target.value)} rows={2} className="admin-textarea" />
      </div>
    </>
  );
}

function QuizFields({ content, onChange, radioGroupName, onUploadingChange }) {
  const c = { ...emptyContent.quiz, ...content, options: content.options || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });

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
        <textarea
          value={c.explanation || ""}
          onChange={(e) => set("explanation")(e.target.value)}
          rows={2}
          placeholder="Чому саме так — коротко, одним-двома реченнями"
          className="admin-textarea"
        />
      </div>
    </>
  );
}

/* ============ Конструктор інтерактивних екранів ============
   Механіки портовані з попередньої vanilla-JS розробки "8 кроків
   телесейлінгу" (див. lib/componentTypes.js). Спільне для всіх: рубрика +
   вступний рядок + власний список елементів, кожен з яких можна
   переставити/видалити, плюс необов'язковий текст-підказка гейта. */

/** Спільні поля-шапка (рубрика/вступ) — щоб не дублювати в кожному типі. */
function ScreenHeaderFields({ c, set, onUploadingChange }) {
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
        <textarea value={c.lead || ""} onChange={(e) => set("lead")(e.target.value)} rows={2} className="admin-textarea" />
      </div>
      {/* Фото доступне КОЖНОМУ типу компонента, не лише інфо-блоку та
          "фото". Стоїть одразу після вступного рядка — там само, де в
          інфо-блоці, і там само, де плеєр його малює: порядок полів у
          конструкторі збігається з порядком на екрані. */}
      <ImageListEditor images={c.images || []} onChange={set("images")} onUploadingChange={onUploadingChange} />
    </>
  );
}

/** Текст, який співробітник бачить під кнопкою «Далі», поки екран заблокований. */
function GateMsgField({ c, set, placeholder }) {
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

/**
 * Рядок списку з кнопками "вгору/вниз/видалити". Порядок тут — це
 * порядок, у якому співробітник побачить елементи, тому переставляти
 * треба прямо в конструкторі, а не перебиванням тексту між полями.
 */
function AccordionFields({ content, onChange, onUploadingChange }) {
  const c = { kicker: "", lead: "", gateMsg: "", ...content, items: content.items || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const ops = useListOps(c.items, set("items"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Картки <span className="admin-hint">— «Далі» відкриється, коли співробітник розгорне ВСІ</span>
        </label>
        {c.items.map((item, i) => (
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
            <textarea
              value={item.body || ""}
              onChange={(e) => ops.update(i, "body", e.target.value)}
              rows={2}
              placeholder="Текст, який розкриється по кліку"
              className="admin-textarea"
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

function ChecklistFields({ content, onChange, onUploadingChange }) {
  const c = { kicker: "", lead: "", gateMsg: "", ...content, items: content.items || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const ops = useListOps(c.items, set("items"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Пункти чек-листа <span className="admin-hint">— «Далі» відкриється, коли позначено всі</span>
        </label>
        {c.items.map((item, i) => (
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
// Значення мають збігатися з BUBBLE_LABELS у ScreenComponents.jsx і
// класами .bubble.* у course-player.css.
const BUBBLE_ROLES = [
  { value: "me", label: "Ви кажете" },
  { value: "client", label: "Клієнт" },
  { value: "manager", label: "Керівник" },
  { value: "colleague", label: "Колега" },
  { value: "tip", label: "Порада" },
  { value: "note", label: "Ремарка" },
];

function ScriptFields({ content, onChange, onUploadingChange }) {
  const c = { kicker: "", lead: "", gateMsg: "", callLabel: "Дзвінок із клієнтом", ...content, bubbles: content.bubbles || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
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
        {c.bubbles.map((b, i) => (
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
            <textarea
              value={b.text || ""}
              onChange={(e) => ops.update(i, "text", e.target.value)}
              rows={2}
              placeholder={`Текст репліки ${i + 1}`}
              className="admin-textarea"
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

function TimelineFields({ content, onChange, onUploadingChange }) {
  const c = { kicker: "", lead: "", gateMsg: "", highlight: null, ...content, steps: content.steps || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const ops = useListOps(c.steps, set("steps"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Кроки <span className="admin-hint">— «Далі» відкриється, коли торкнулись кожного</span>
        </label>
        {c.steps.map((step, i) => (
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
            <textarea
              value={step.detail || ""}
              onChange={(e) => ops.update(i, "detail", e.target.value)}
              rows={2}
              placeholder="Суть кроку — розкриється по кліку"
              className="admin-textarea"
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
          {c.steps.map((step, i) => (
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

/** Поле "самостійне фото" — просто ImageListEditor без решти info-полів. */
function PhotoFields({ content, onChange, onUploadingChange }) {
  const c = { images: [], ...content, images: content.images || [] };
  return <ImageListEditor images={c.images} onChange={(images) => onChange({ ...c, images })} onUploadingChange={onUploadingChange} />;
}

/** Поле "довільний ввід" — лише підпис/плейсхолдер, значення ніде не
 * зберігається (гейт "щось введено", перевіряється в плеєрі). */
/**
 * Гаряча точка на фото. Зони задаються КЛІКОМ прямо по зображенню —
 * набирати координати числами було б знущанням, а drag-and-drop погано
 * працює на тач-екранах, з яких цю адмінку теж відкривають.
 *
 * Координати й радіус — у відсотках від ширини фото: те саме зображення
 * показується співробітнику на телефоні й на ноутбуці різного розміру,
 * піксельні значення там розійшлися б.
 */
function HotspotFields({ content, onChange, onUploadingChange }) {
  const c = { kicker: "", lead: "", explanation: "", ...content, images: content.images || [], zones: content.zones || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const [radius, setRadius] = useState(8);
  const image = c.images.find((img) => img.url);

  function addZoneAt(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    set("zones")([...c.zones, { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), r: radius }]);
  }

  return (
    <>
      <ScreenHeaderFields c={c} set={set} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Правильні зони{" "}
          <span className="admin-hint">— натисніть по фото, щоб додати зону; влучанням вважається будь-яка з них</span>
        </label>
        {!image ? (
          <p className="admin-hint">Спочатку додайте фото вище — зони ставляться прямо по ньому.</p>
        ) : (
          <>
            <div className="admin-row">
              <label className="admin-label" style={{ margin: 0 }}>
                Радіус зони, % ширини
              </label>
              <input
                type="number"
                min="2"
                max="40"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value) || 8)}
                className="admin-input-flex"
                style={{ maxWidth: 90 }}
              />
              <button
                type="button"
                className="admin-btn-link"
                onClick={() => set("zones")([])}
                disabled={c.zones.length === 0}
              >
                Очистити зони
              </button>
            </div>
            {/* Звичайний <img>, а не next/image: тут важлива рівно та
                геометрія, по якій рахуються відсоткові координати кліку,
                без будь-якого ресайзу під капотом. */}
            <div className="adm-hotspot-canvas" onClick={addZoneAt} role="presentation">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" />
              {c.zones.map((z, i) => (
                <span
                  key={i}
                  className="adm-hotspot-zone"
                  style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${(z.r || 8) * 2}%` }}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <p className="admin-hint">
              {c.zones.length === 0 ? "Жодної зони — питання поки не має правильної відповіді." : `Зон: ${c.zones.length}`}
            </p>
          </>
        )}
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Пояснення до відповіді <span className="admin-hint">— показується ПІСЛЯ відповіді, і правильної теж</span>
        </label>
        <textarea
          value={c.explanation || ""}
          onChange={(e) => set("explanation")(e.target.value)}
          rows={2}
          placeholder="Чому саме це місце — коротко"
          className="admin-textarea"
        />
      </div>
    </>
  );
}

function InputFields({ content, onChange }) {
  const c = { label: "", placeholder: "", multiline: false, ...content };
  const set = (field) => (value) => onChange({ ...c, [field]: value });

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Підпис над полем</label>
        <input value={c.label} onChange={(e) => set("label")(e.target.value)} placeholder="Наприклад: Ваші думки" className="admin-input-flex" />
      </div>
      <div className="admin-field">
        <label className="admin-label">Плейсхолдер у полі</label>
        <input value={c.placeholder} onChange={(e) => set("placeholder")(e.target.value)} className="admin-input-flex" />
      </div>
      <label className="admin-checkbox">
        <input type="checkbox" checked={c.multiline} onChange={(e) => set("multiline")(e.target.checked)} />
        <span>Багаторядкове поле</span>
      </label>
    </>
  );
}

/** Поля конструктора під конкретний тип компонента — одна точка вибору,
 * щоб додавання нового типу було правкою в двох місцях (lib/componentTypes.js
 * + тут), а не пошуком по всьому редактору. */
function ComponentTypeFields({ type, content, onChange, componentId, onUploadingChange }) {
  switch (type) {
    case "quiz":
      return <QuizFields content={content} onChange={onChange} radioGroupName={`qtype-${componentId}`} onUploadingChange={onUploadingChange} />;
    case "accordion":
      return <AccordionFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "checklist":
      return <ChecklistFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "script":
      return <ScriptFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "timeline":
      return <TimelineFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "photo":
      return <PhotoFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "hotspot":
      return <HotspotFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "input":
      return <InputFields content={content} onChange={onChange} />;
    default:
      return <InfoFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
  }
}

/** Тільки поля форми правки (без грід-обгортки) — рендериться в лівій
 * колонці спільного admin-editor-grid разом з навігацією по екранах. */
function ComponentEditForm({ component, onSaved, onDeleted, onDuplicate, onLiveChange, onRegisterSave }) {
  const [title, setTitle] = useState(component.title || "");
  const [type, setType] = useState(component.type);
  const [content, setContent] = useState(component.content);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  // Батько рендерить <ComponentEditForm key={component.id} .../> — зміна
  // component.id вже сама по собі перемонтовує форму (useState підхопить
  // нові initial values). Цей ефект — для іншого випадку: той самий
  // component.id, але вміст оновився ЗЗОВНІ (сервер повернув нормалізовані
  // дані після handleSave) — синхронізуємо форму з тим, що реально
  // зберіглося.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(component.title || "");
    setType(component.type);
    setContent(component.content);
    setError("");
    setImageUploading(false);
  }, [component.id, component.title, component.type, component.content]);

  // Прокидаємо поточний стан форми нагору для живої прев'ю в правій колонці.
  useEffect(() => {
    onLiveChange({ id: component.id, title, type, content });
  }, [component.id, title, type, content, onLiveChange]);

  // Незбережені правки — порівнюємо з тим, що реально лежить на сервері
  // (component-пропс), а не з "чи змінили хоч раз" — так індикатор гасне
  // сам собою, якщо повернути значення до вихідного вручну.
  // Те саме значення, що реально піде в PATCH — інакше в інфо-екрана з
  // раніше збереженою назвою індикатор "незбережені зміни" світився б
  // вічно: поле сховане, змінити його нічим, а порівняння не сходиться.
  const effectiveTitle = type === "info" ? null : title || null;
  const isDirty =
    effectiveTitle !== (component.title || null) ||
    type !== component.type ||
    JSON.stringify(content) !== JSON.stringify(component.content);

  // Застарілий тип лишається в списку ЛИШЕ поки він у цього
  // компонента: обрати його заново, перемкнувшись на інший тип і назад,
  // уже не можна.
  const selectableTypes = COMPONENT_TYPES.some((t) => t.value === type)
    ? COMPONENT_TYPES
    : [...COMPONENT_TYPES, ...RETIRED_COMPONENT_TYPES.filter((t) => t.value === type)];

  // Збереження відбувається ЛИШЕ при переході на інший компонент/екран
  // (і по кнопці «Зберегти»). Автозбереження по таймеру тут свідомо
  // немає: воно слало б PATCH кожні кілька секунд набору тексту — сотні
  // зайвих записів у базу за одну сесію редагування замість одного.
  //
  // saveRef тримає АКТУАЛЬНУ версію handleSave (вона замикає title/type/
  // content поточного рендера) — інакше батько викликав би збереження зі
  // станом, яким він був на момент першого рендера. Оновлюємо в ефекті, а
  // не в тілі компонента (запис у ref під час рендера — помилка
  // react-hooks/refs); ефект без списку залежностей виконується після
  // КОЖНОГО рендера, тож у ref завжди свіжа функція.
  const saveRef = useRef(handleSave);
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    saveRef.current = handleSave;
    isDirtyRef.current = isDirty;
  });

  // Остання страховка: закриття вкладки чи перехід за посиланням. Рівно
  // ОДИН запит і лише якщо є що зберігати — це не автозбереження по
  // таймеру, від якого ми свідомо відмовились. pagehide, а не
  // beforeunload: той показує браузерний діалог "Покинути сайт?", якого
  // тут бути не повинно.
  useEffect(() => {
    function flushOnLeave() {
      if (!isDirtyRef.current) return;
      saveRef.current({ silent: true, keepalive: true });
    }
    window.addEventListener("pagehide", flushOnLeave);
    return () => window.removeEventListener("pagehide", flushOnLeave);
  }, []);

  // Батько зберігає цей компонент перед переходом на інший — тому йому
  // потрібен доступ і до самої функції, і до того, чи є що зберігати.
  useEffect(() => {
    onRegisterSave?.({ save: () => saveRef.current({ silent: true }), isDirty });
  }, [onRegisterSave, isDirty]);

  function handleTypeChange(newType) {
    setType(newType);
    setContent(defaultContentForType(newType));
  }

  /**
   * @param {{ silent?: boolean }} [opts] silent — виклик не від кнопки, а
   *   від автозбереження чи переходу на інший компонент. Тоді причини, з
   *   яких зберігати ще рано (вантажиться фото, у питання немає тексту),
   *   не показуються помилкою: користувач нічого не натискав, і червоний
   *   рядок нізвідки лише збивав би з пантелику. Просто пропускаємо —
   *   наступна спроба станеться сама.
   */
  async function handleSave(opts = {}) {
    const silent = opts.silent === true;
    // keepalive — щоб запит пережив закриття вкладки: звичайний fetch у
    // цей момент браузер просто скасовує.
    const keepalive = opts.keepalive === true;
    // Фото ще вантажиться (в тому ж content.images) — url на цю мить
    // порожній, зберегти зараз означало б записати екран без фото.
    if (imageUploading) {
      if (!silent) setError("Зачекайте, поки фото завантажиться, і збережіть ще раз.");
      return false;
    }
    if (type === "quiz" && !title.trim()) {
      if (!silent) setError("Для питання заголовок (текст питання) обов'язковий.");
      return false;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/components/${component.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Для інфо-екрана поле сховане, тож і зберігаємо null, а не
        // старе значення: інакше в навігації зліва лишався б підпис, який
        // уже нічим не відредагувати й не прибрати.
        body: JSON.stringify({ title: type === "info" ? null : title || null, type, content }),
        keepalive,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(await res.json());
      return true;
    } catch (err) {
      // Помилку показуємо ЗАВЖДИ, навіть при тихому збереженні: мовчки
      // проковтнути невдалий запис означало б, що людина далі редагує
      // курс у впевненості, що все збережено.
      setError("Помилка збереження: " + err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Видалити екран «${component.title || COMPONENT_TYPE_LABELS[component.type]}»?`)) return;
    const res = await fetch(`/api/admin/components/${component.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(component.id);
  }

  return (
    <div className="admin-lesson-card">
      <div className="admin-row">
        {/* Інфо-екран не має службової назви: у нього вже є рубрика й
            заголовок, які видно самому співробітнику, і третій підпис
            "лише для адмінки" дублював їх, нічого не додаючи. В інших
            типах поле лишається: у quiz це ТЕКСТ ПИТАННЯ (обов'язковий,
            а не службовий підпис), у решти — єдиний спосіб розрізнити
            однотипні екрани в навігації зліва. */}
        {type !== "info" && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "quiz" ? "Текст питання" : "Назва (лише для адмінки)"}
            className="admin-input-flex admin-title-input"
          />
        )}
        {/* Якщо в цього компонента застарілий тип (є в збереженому
            контенті, але вже не пропонується) — додаємо його в список
            окремим варіантом. Інакше select не знайшов би свого значення,
            показав би чужий тип і перезаписав би його при збереженні. */}
        <select
          value={type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="admin-select"
          title={selectableTypes.find((t) => t.value === type)?.hint}
        >
          {selectableTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {isDirty && (
          <span className="admin-hint admin-unsaved-badge" title="Є незбережені зміни на цьому екрані">
            ● незбережено
          </span>
        )}
      </div>
      <p className="admin-hint">{COMPONENT_TYPES.find((t) => t.value === type)?.hint}</p>

      <ComponentTypeFields
        type={type}
        content={content}
        onChange={setContent}
        componentId={component.id}
        onUploadingChange={setImageUploading}
      />

      {error && <p className="admin-error">{error}</p>}
      <div className="admin-row">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || imageUploading}
          className="admin-btn"
          title="Зберегти зміни цього екрану"
        >
          {(saving || imageUploading) && <SpinnerIcon />}
          {imageUploading ? "Зачекайте, фото вантажиться…" : saving ? "Збереження…" : "Зберегти"}
        </button>
        <button type="button" onClick={() => onDuplicate(component)} className="admin-btn-link" title="Створити копію цього екрану одразу після нього">
          Дублювати
        </button>
        <button type="button" onClick={handleDelete} className="admin-btn admin-btn-danger" title="Видалити цей екран назавжди">
          Видалити
        </button>
      </div>
    </div>
  );
}

/** Права колонка — жива прев'ю обраного екрану З ТИМ САМИМ "хромом", що
 * й реальний CoursePlayer (шапка з лічильником кроку, прогрес-бар, кнопки
 * навігації внизу — components/CoursePlayer.jsx) — не просто вміст
 * екрану, а точний вигляд того, що побачить співробітник у застосунку.
 * Кнопки "Назад"/"Далі" тут керують ТИМ САМИМ обраним екраном, що й ліва
 * колонка (onBack/onNext), — прев'ю справді "гортається" так само. */
/**
 * Рамка iPhone 17 Pro Max (space black) — SVG зі СПРАВЖНІМ прозорим
 * вирізом під контент (mask: зовнішній контур мінус внутрішній rect), не
 * намальований сірий бордюр. Dynamic Island — окрема заповнена форма
 * ПОВЕРХ контенту (шар вище за .course-card), точно як на реальному
 * пристрої. viewBox 300×650 навмисно дає рівно 9:19.5 — координати
 * узгоджені з inset у .iphone-mockup .course-card (app/styles/admin.css).
 */
function IPhoneFrame() {
  return (
    <svg className="iphone-mockup-frame" viewBox="0 0 300 650" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <mask id="iphoneRingMask">
          <rect x="0" y="0" width="300" height="650" rx="58" fill="#fff" />
          <rect x="7" y="7" width="286" height="636" rx="51" fill="#000" />
        </mask>
      </defs>
      <rect x="0" y="0" width="300" height="650" rx="58" fill="#000000" mask="url(#iphoneRingMask)" />
      <rect x="0.5" y="0.5" width="299" height="649" rx="58" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      {/* Dynamic Island — над контентом, не виріз у рамці */}
      <rect x="115" y="25" width="70" height="21" rx="10.5" fill="#05070a" />
      {/* Бокові клавіші — суто декоративні */}
      <rect x="-3" y="150" width="3" height="42" rx="1.5" fill="#000000" />
      <rect x="-3" y="205" width="3" height="42" rx="1.5" fill="#000000" />
      <rect x="300" y="165" width="3" height="60" rx="1.5" fill="#000000" />
    </svg>
  );
}

/**
 * Рамка ноутбука (той самий mask-прийом, що й IPhoneFrame — суцільна форма
 * мінус прозорий виріз під контент). viewBox навмисно ширший за саму
 * "кришку" (-30..1030 замість 0..1000) — база клавіатури свідомо ширша за
 * екран (справжня пропорція лаптопа), і зайвий простір ліворуч/праворуч
 * саме під це. Координати вирізу (20,20)-(980,540) узгоджені з inset у
 * .laptop-mockup .course-card (app/styles/admin.css) так само, як для
 * iPhone.
 *
 * Нижня частина (шарнір+база клавіатури, усе нижче y=560) зменшена на 30%
 * за проханням користувача — було 640 повної висоти (80px "хвоста" під
 * екраном), стало 608 (56px): та сама пропорція шарніра/бази/виїмки,
 * просто масштабована ×0.7 відносно лінії y=560, де закінчується сам
 * екран. Це й зменшує загальну висоту рамки (менше "зайвого" знизу), і
 * прямо допомагає з переповненням вьюпорту (нижче, .laptop-mockup) —
 * коротша рамка при тій самій ширині фізично нижча.
 */
function LaptopFrame() {
  return (
    <svg className="laptop-mockup-frame" viewBox="-30 0 1060 608" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <mask id="laptopScreenMask">
          <rect x="0" y="0" width="1000" height="560" rx="26" fill="#fff" />
          <rect x="20" y="20" width="960" height="520" rx="12" fill="#000" />
        </mask>
      </defs>
      {/* Кришка з екраном */}
      <rect x="0" y="0" width="1000" height="560" rx="26" fill="#1d1d1f" mask="url(#laptopScreenMask)" />
      <rect x="0.5" y="0.5" width="999" height="559" rx="26" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      {/* Камера */}
      <circle cx="500" cy="12" r="3.2" fill="#05070a" />
      {/* Шарнір */}
      <rect x="60" y="561.4" width="880" height="7" rx="3" fill="#2a2a2d" />
      {/* База клавіатури — ширша за екран, з виїмкою під трекпад спереду */}
      <rect x="-25" y="572.6" width="1050" height="35" rx="7" fill="#3a3a3d" />
      <rect x="410" y="572.6" width="180" height="5.6" rx="2.8" fill="#1d1d1f" opacity="0.5" />
    </svg>
  );
}

function LaptopDeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="1.3" />
      <line x1="1" y1="20" x2="23" y2="20" />
    </svg>
  );
}

/**
 * Сам вміст мокапу — .course-card (шапка/прогрес/контент/навігація) +
 * SVG-рамка, спільні для ДОКНУТОГО телефонного прев'ю (завжди на екрані,
 * поруч з редактором) і повноекранної модалки (components нижче) —
 * інакше довелось би тримати той самий JSX у двох місцях. device —
 * "phone"|"laptop", вирішує лише яка обгортка/рамка рендериться, самі
 * пропси екрана (components/stepNumber/onBack/...) не залежать від
 * пристрою.
 */
function DeviceMockup({ device, components, componentNumbers, stepNumber, totalSteps, onBack, onNext, canGoBack, canGoNext, inModal }) {
  const hasScreen = components && components.length > 0;
  // Той самий скрол-контейнер, що й у реальному плеєрі (.cp-viewport) — той
  // самий фікс: без явного скидання наступний екран у прев'ю відкривався
  // "з середини", якщо попередній був прогорнутий вниз.
  const viewportRef = useRef(null);
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [stepNumber]);
  const isLaptop = device === "laptop";
  // inModal — телефон У МОДАЛЦІ навмисно БІЛЬШИЙ за докнуту версію (за
  // проханням користувача "увеличь ее в размер вьюпорта"): докнута версія
  // навмисно тримається реалістичної щільності маленького екрана (formula
  // в .iphone-mockup), а в повноекранній модалці для цього немає причин —
  // там, як і для ноутбука, варто реально заповнити виділений простір.
  // Модифікатор-клас (.iphone-mockup--modal), а не інший формула прямо тут,
  // щоб .cp-zoom-wrap-щільність (app/styles/admin.css) лишалась спільною.
  const mockupClass = isLaptop ? "laptop-mockup" : inModal ? "iphone-mockup iphone-mockup--modal" : "iphone-mockup";
  return (
    <div className={mockupClass}>
      <div className="course-card">
        {/* Окрема обгортка, а не zoom напряму на .course-card — .course-card
            сам позиціонується через position:absolute+inset% відносно
            рамки (iphone-mockup/laptop-mockup), і саме ЦІ percentage-
            обчислення мають лишитись у "реальних" (незумлених) координатах
            рамки; zoom тут скоуплено лише на дитину, що вже отримала свій
            розмір (height:100% від .course-card, обчислений ДО зуму) —
            тож сама коробка не змінюється, лише контент усередині
            рендериться дрібніше/щільніше (app/styles/admin.css). */}
        <div className="cp-zoom-wrap">
        <div className="appbar">
          <button type="button" className="iconbtn" onClick={onBack} disabled={!canGoBack} aria-label="Назад" title="Попередній екран у прев'ю">
            <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
              <ChevronIcon />
            </span>
          </button>
          <div style={{ flex: 1 }} />
          {hasScreen && (
            <span className="cp-step-count">
              {stepNumber}/{totalSteps}
            </span>
          )}
        </div>
        {hasScreen && (
          <div className="cp-progress-track">
            <div className="cp-progress-fill" style={{ width: `${Math.round((stepNumber / totalSteps) * 100)}%` }} />
          </div>
        )}

        <div className="cp-viewport" ref={viewportRef}>
          {!hasScreen ? (
            <p className="admin-preview-empty">Оберіть екран зліва, щоб побачити прев&apos;ю.</p>
          ) : (
            <div className="cp-screen">
              {components.map((component) => (
                <div className="screen-component" key={component.id}>
                  {/* Оцінювані типи (quiz, hotspot) тримають локальну відповідь у
                      PreviewQuiz; ComponentScreen для hotspot кейса не має і
                      малював би його як звичайний інфо-екран без зон. */}
                  {isScored(component) ? (
                    <PreviewQuiz component={component} screenNumber={componentNumbers?.get(component.id) ?? stepNumber} />
                  ) : (
                    // Той самий диспетчер, що й у плеєрі — інтерактивні екрани в
                    // прев'ю справді клікаються (картки розгортаються, репліки
                    // з'являються), щоб автор одразу перевірив механіку, а не
                    // здогадувався по полях форми. key — щоб при перемиканні
                    // типу внутрішній стан взаємодії починався з нуля.
                    // Номер у кикері — наскрізний по компонентах (1, 2, 3…), як у
                    // реальному плеєрі, а не номер екрана: два блоки на одному
                    // екрані показували б однакову «1».
                    <ComponentScreen
                      key={`${component.id}-${component.type}`}
                      component={component}
                      screenNumber={componentNumbers?.get(component.id) ?? stepNumber}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {hasScreen && (
          <div className="navwrap">
            <div className="navbar">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onBack}
                style={{ visibility: canGoBack ? "visible" : "hidden" }}
                title="Попередній екран у прев'ю"
              >
                Назад
              </button>
              <button type="button" className="btn btn-primary" onClick={onNext} disabled={!canGoNext} title="Наступний екран у прев'ю">
                Далі
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
      {isLaptop ? <LaptopFrame /> : <IPhoneFrame />}
    </div>
  );
}

/**
 * Права колонка. Докнутий інлайн-мокап — ЗАВЖДИ телефон (єдиний формат,
 * що реально влазить у фіксовану 40%-колонку поруч із редактором, не
 * ламаючись і не обрізаючись) — ноутбук у ту саму колонку МЕХАНІЧНО не
 * влазить (ширший за пропорцією, довший рядок тексту), тому для нього
 * (і за бажанням для телефону теж, кнопкою "На весь екран") прев'ю
 * відкривається в модалці на весь екран, де під пристрій реально є
 * місце — той самий підхід, що Webflow/Framer ("Preview" відкриває
 * повноекранний режим, а не намагається влізти в бокову панель).
 */
/**
 * Повне проходження курсу в прев'ю — той самий CoursePlayer, що бачить
 * співробітник, від вступного екрана до фінального з конфеті й
 * сертифікатом. previewMode вимикає БУДЬ-ЯКИЙ запис: ні submit, ні
 * module-complete, ні localStorage (ключ прогресу там спільний зі
 * справжнім курсом — без цього автор затирав би власний реальний прогрес).
 *
 * Портал у document.body — з тієї самої причини, що й у модалки прев'ю
 * нижче: .adm-shell несе zoom:85% на все піддерево, і vh-розрахунки
 * всередині нього тихо стискаються.
 */
function CourseRunPreview({ course, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Той самий плаский список екранів, що будує сторінка курсу
  // (app/courses/[slug]/page.js) — плеєр очікує саме таку форму.
  const screens = (course.modules || []).flatMap((m) =>
    (m.screens || []).map((s) => ({
      id: s.id,
      title: s.title,
      moduleId: m.id,
      moduleTitle: m.title,
      components: s.components || [],
    }))
  );

  return createPortal(
    <div className="admin-preview-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-preview-modal">
        <button type="button" className="iconbtn admin-preview-modal-close" onClick={onClose} aria-label="Закрити прев'ю" title="Закрити">
          <XIcon />
        </button>
        <div className="admin-preview-modal-body">
          <div className={`${course.previewDevice === "laptop" ? "laptop-mockup" : "iphone-mockup"} iphone-mockup--modal adm-run-preview`}>
            <div className="adm-run-preview-badge">Прев&apos;ю — результати не зберігаються</div>
            {screens.length === 0 ? (
              <p className="admin-hint" style={{ padding: 20 }}>У курсі ще немає жодного екрана.</p>
            ) : (
              <CoursePlayer
                previewMode
                course={{
                  id: course.id,
                  slug: course.slug,
                  title: course.title,
                  description: course.description,
                  streakMessages: course.streakMessages,
                  passThreshold: course.passThreshold,
                  certificateEnabled: course.certificateEnabled,
                }}
                screens={screens}
                enrollmentId={null}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ComponentPreview({ components, componentNumbers, stepNumber, totalSteps, onBack, onNext, canGoBack, canGoNext, previewDevice, onRunCourse }) {
  const [modalOpen, setModalOpen] = useState(false);
  const isLaptop = previewDevice === "laptop";

  // Було: авто-відкриття модалки одразу, щойно isLaptop===true — за
  // словами користувача, це означало, що модалка вилазила ВІДРАЗУ при
  // самому вході в конструктор ноутбук-курсу, ще до будь-якої дії адміна —
  // неочікуваний "сюрприз-модал". Тепер модалка відкривається ЛИШЕ явним
  // кліком (кнопка нижче), як і для телефону.

  // Esc закриває модалку — очікувана клавіатурна поведінка для будь-якого
  // overlay/діалогу.
  useEffect(() => {
    if (!modalOpen) return undefined;
    function handleKey(e) {
      if (e.key === "Escape") setModalOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [modalOpen]);

  const previewProps = { components, componentNumbers, stepNumber, totalSteps, onBack, onNext, canGoBack, canGoNext };

  return (
    <div className="admin-editor-preview">
      {/* Без мітки платформи й без перемикача — платформа обирається ОДИН
          РАЗ у "Загальна інформація" (components/AdminDashboard.jsx,
          Course.previewDevice), тут просто мокап відповідного пристрою,
          за проханням користувача, без зайвого напису над ним. */}
      {isLaptop ? (
        // Ноутбук ніколи не докується інлайн (саме це "не вміщалось
        // нормально") — сама колонка тепер лише 10% ширини
        // (.admin-editor-grid.is-laptop-preview), тож замість цілого
        // плейсхолдера з іконкою й абзацом тексту — компактна кнопка,
        // яка й так туди не влізла б.
        <button
          type="button"
          className="iconbtn admin-laptop-preview-btn"
          onClick={() => setModalOpen(true)}
          title="Відкрити прев'ю ноутбука на весь екран"
          aria-label="Відкрити прев'ю ноутбука на весь екран"
        >
          <LaptopDeviceIcon />
        </button>
      ) : (
        <>
          <DeviceMockup device="phone" {...previewProps} />
          <div className="admin-row admin-preview-actions">
            <button type="button" className="admin-btn-link admin-preview-expand-btn" onClick={() => setModalOpen(true)}>
              ⛶ На весь екран
            </button>
            {/* Повне проходження від вступу до сертифіката — щоб автор
                побачив те саме, що й співробітник, а не окремі екрани. */}
            <button
              type="button"
              className="admin-btn-link"
              onClick={onRunCourse}
              title="Пройти курс цілком, як співробітник — без збереження результатів"
            >
              ▶ Пройти курс
            </button>
          </div>
        </>
      )}

      {/* createPortal у document.body, не звичайний вкладений JSX — .adm-shell
          (components/AdminShell.jsx) несе zoom:85% на весь свій піддерево
          (навмисно, компенсує розмір тексту адмінки), і position:fixed
          НЕ рятує від успадкованого zoom — усі vh-розрахунки модалки
          (.laptop-mockup/.iphone-mockup--modal, app/styles/admin.css)
          тихо рахувались у вже стиснутих на 15% координатах, тому модалка
          щоразу виходила меншою за розрахунок (реальний баг користувача,
          не вигадана обережність) — так само, як .adm-shell сам собі
          компенсує це через calc(100vh/0.85) для min-height. Портал
          повністю виносить DOM-вузол модалки з-під того zoom, тож 100vh
          усередині — це справді 100vh. */}
      {modalOpen &&
        createPortal(
          <div className="admin-preview-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
            <div className="admin-preview-modal">
              <button
                type="button"
                className="iconbtn admin-preview-modal-close"
                onClick={() => setModalOpen(false)}
                aria-label="Закрити прев'ю"
                title="Закрити"
              >
                <XIcon />
              </button>
              <div className="admin-preview-modal-body">
                <DeviceMockup device={previewDevice} inModal {...previewProps} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** Обгортка над QuizScreen з власним локальним станом відповіді — щоб
 * прев'ю в /admin можна було "клікнути" так само, як побачить співробітник,
 * не чіпаючи реальний Enrollment. */
function PreviewQuiz({ component, screenNumber }) {
  const [answer, setAnswer] = useState(undefined);
  // Скидаємо відповідь у прев'ю щоразу, як екран/його вміст змінюється —
  // ефект, а не похідний стан, бо триґериться і зі стабільним component.id
  // (правки контенту вживу), не тільки при зміні обраного екрана.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setAnswer(undefined), [component.id, component.content]);
  const Screen = component.type === "hotspot" ? HotspotScreen : QuizScreen;
  return <Screen component={component} screenNumber={screenNumber} answer={answer} onAnswer={setAnswer} />;
}

/** Список компонентів екрана з перетягуванням (та сама механіка, що й
 * модулі, — див. ModuleHeader/handleModuleDrop) — ручка на кожному рядку,
 * порядок зберігається одразу через PATCH /api/admin/components/:id. */
function ComponentNavList({ components, selectedComponentId, onSelect, onReordered }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  function handleDrop(targetIndex) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...components];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((c, i) => ({ ...c, order: i + 1 }));
    onReordered(withOrder);
    Promise.all(
      withOrder.map((component, i) =>
        fetch(`/api/admin/components/${component.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i + 1 }),
        })
      )
    );
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="admin-lesson-nav">
      {components.map((component, i) => (
        <div
          key={component.id}
          className={`admin-lesson-nav-row${overIndex === i && dragIndex !== null && dragIndex !== i ? " admin-drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOverIndex(i);
          }}
          onDragLeave={() => setOverIndex((v) => (v === i ? null : v))}
          onDrop={() => handleDrop(i)}
        >
          <span
            className="admin-drag-handle"
            title="Перетягніть, щоб змінити порядок екранів"
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
          >
            <GripIcon />
          </span>
          <button
            type="button"
            className={`admin-lesson-nav-item${component.id === selectedComponentId ? " active" : ""}`}
            onClick={() => onSelect(component.id)}
            title="Відкрити цей екран для редагування"
          >
            <span>{component.title || COMPONENT_TYPE_LABELS[component.type]}</span>
            <span className="admin-lesson-nav-type">{COMPONENT_TYPE_LABELS[component.type] || component.type}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function NewComponentForm({ screenId, nextOrder, onCreated }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("info");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenId, title: title || null, type, order: nextOrder, content: defaultContentForType(type) }),
      });
      if (res.ok) {
        setTitle("");
        onCreated(await res.json());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-row admin-new-lesson">
      <input
        placeholder="Назва нового екрану (необов'язково)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        className="admin-input-flex"
      />
      <select value={type} onChange={(e) => setType(e.target.value)} className="admin-select">
        {COMPONENT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={handleCreate} disabled={saving} className="admin-btn" title="Створити новий компонент на цьому екрані">
        {saving && <SpinnerIcon />}+ Додати компонент
      </button>
    </div>
  );
}

function NewScreenForm({ moduleId, nextOrder, onCreated }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/screens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, title, order: nextOrder }),
      });
      if (res.ok) {
        setTitle("");
        onCreated(await res.json());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-row admin-new-lesson">
      <input
        placeholder="Назва нового екрану"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        className="admin-input-flex"
      />
      <button type="button" onClick={handleCreate} disabled={saving} className="admin-btn-link" title="Створити новий екран у цьому модулі">
        {saving && <SpinnerIcon />}+ Додати екран
      </button>
    </div>
  );
}

function NewModuleForm({ courseId, nextOrder, onCreated }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, title, order: nextOrder }),
      });
      if (res.ok) {
        setTitle("");
        onCreated(await res.json());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-row admin-new-lesson">
      <input
        placeholder="Назва нового модуля"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        className="admin-input-flex admin-title-input"
      />
      <button type="button" onClick={handleCreate} disabled={saving} className="admin-btn" title="Створити новий модуль курсу">
        {saving && <SpinnerIcon />}+ Додати модуль
      </button>
    </div>
  );
}

function ModuleHeader({ courseModule, expanded, onToggleExpand, summary, onSaved, onDeleted, dragHandleProps }) {
  const [title, setTitle] = useState(courseModule.title);
  const [cooldownDays, setCooldownDays] = useState(courseModule.cooldownDays ?? "");
  const [retakeCooldownDays, setRetakeCooldownDays] = useState(courseModule.retakeCooldownDays ?? "");
  const [saving, setSaving] = useState(false);

  async function save(patch) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/modules/${courseModule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) onSaved(await res.json());
    } finally {
      setSaving(false);
    }
  }

  function handleTitleBlur() {
    if (title === courseModule.title || !title.trim()) return;
    save({ title });
  }

  function handleCooldownBlur() {
    const value = cooldownDays === "" ? null : Number(cooldownDays);
    if (value === (courseModule.cooldownDays ?? null)) return;
    save({ cooldownDays: value });
  }

  function handleRetakeCooldownBlur() {
    const value = retakeCooldownDays === "" ? null : Number(retakeCooldownDays);
    if (value === (courseModule.retakeCooldownDays ?? null)) return;
    save({ retakeCooldownDays: value });
  }

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Видалити модуль «${courseModule.title}» разом з усіма його екранами?`)) return;
    const res = await fetch(`/api/admin/modules/${courseModule.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(courseModule.id);
  }

  return (
    <div className="admin-accordion-header" onClick={onToggleExpand}>
      <span
        className="admin-drag-handle"
        title="Перетягніть, щоб змінити порядок модулів"
        onClick={(e) => e.stopPropagation()}
        {...dragHandleProps}
      >
        <GripIcon />
      </span>
      <span className={`admin-accordion-caret${expanded ? " open" : ""}`}>
        <ChevronIcon />
      </span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        onClick={(e) => e.stopPropagation()}
        className="admin-input-flex admin-title-input"
        style={{ fontSize: 16, fontWeight: 700 }}
      />
      {!expanded && <span className="admin-hint admin-accordion-summary">{summary}</span>}
      {expanded && (
        <label
          className="admin-module-unlock"
          onClick={(e) => e.stopPropagation()}
          title="Скільки днів має минути з моменту, як співробітник склав ПОПЕРЕДНІЙ модуль, перш ніж відкриється цей"
        >
          Пауза між модулями
          <input
            type="number"
            min="0"
            value={cooldownDays}
            onChange={(e) => setCooldownDays(e.target.value)}
            onBlur={handleCooldownBlur}
            placeholder="0"
          />
          дн.
        </label>
      )}
      {expanded && (
        <label
          className="admin-module-unlock"
          onClick={(e) => e.stopPropagation()}
          title="Скільки днів має минути з моменту, як співробітник СКЛАВ цей модуль, перш ніж зможе перепройти його ще раз (реальний тест). На провалену спробу не впливає — її можна перепройти одразу."
        >
          Пауза перед повторним проходженням
          <input
            type="number"
            min="0"
            value={retakeCooldownDays}
            onChange={(e) => setRetakeCooldownDays(e.target.value)}
            onBlur={handleRetakeCooldownBlur}
            placeholder="2"
          />
          дн.
        </label>
      )}
      {saving && <span className="admin-hint">збереження…</span>}
      <button type="button" onClick={handleDelete} className="admin-icon-btn" aria-label="Видалити модуль" title="Видалити цей модуль і весь його вміст">
        ✕
      </button>
    </div>
  );
}

function ScreenHeader({ screen, expanded, onToggleExpand, summary, onDelete }) {
  return (
    <div className="admin-accordion-header admin-accordion-header-sub" onClick={onToggleExpand}>
      <span className={`admin-accordion-caret${expanded ? " open" : ""}`}>
        <ChevronIcon />
      </span>
      <h3>{screen.title}</h3>
      <span className="admin-hint admin-accordion-summary">{summary}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="admin-icon-btn"
        aria-label="Видалити екран"
        title="Видалити цей екран і всі його компоненти"
      >
        ✕
      </button>
    </div>
  );
}

export function AdminCourseEditor({ courseId }) {
  // Перехід з дашборду /admin по конкретному модулю (?module=ID) — одразу
  // відкриває перший екран цього модуля для правки, а не перший екран
  // першого модуля курсу.
  const searchParams = useSearchParams();
  const focusedModuleId = Number(searchParams.get("module")) || null;

  const [course, setCourse] = useState(null);
  const [selectedComponentId, setSelectedComponentId] = useState(null);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [expandedScreenId, setExpandedScreenId] = useState(null);
  const [livePreviewComponent, setLivePreviewComponent] = useState(null);
  // Повне проходження курсу в прев'ю (CourseRunPreview) — окремо від
  // модалки одного екрана.
  const [runPreview, setRunPreview] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dragModuleIndex, setDragModuleIndex] = useState(null);
  const [overModuleIndex, setOverModuleIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/courses/${courseId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((courseData) => {
        if (cancelled) return;
        setCourse(courseData);
        const focusedModule = courseData.modules.find((m) => m.id === focusedModuleId);
        const startModule = focusedModule || courseData.modules[0];
        const startScreen = startModule?.screens[0];
        const firstComponent = startScreen?.components[0];
        if (firstComponent) {
          setSelectedComponentId(firstComponent.id);
          setExpandedModuleId(startModule.id);
          setExpandedScreenId(startScreen.id);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // Модуль -> Екран -> Компонент (див. schema.prisma) — всі оновлення
  // стану йдуть через мапу по modules, знаходячи потрібний модуль/екран за id.
  function updateComponentInState(screenId, updated) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => ({
        ...m,
        screens: m.screens.map((s) =>
          s.id === screenId ? { ...s, components: s.components.map((comp) => (comp.id === updated.id ? updated : comp)) } : s
        ),
      })),
    }));
  }

  function removeComponentFromState(screenId, componentId) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => ({
        ...m,
        screens: m.screens.map((s) =>
          s.id === screenId ? { ...s, components: s.components.filter((comp) => comp.id !== componentId) } : s
        ),
      })),
    }));
    if (selectedComponentId === componentId) setSelectedComponentId(null);
  }

  function addComponentToState(screenId, created) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => ({
        ...m,
        screens: m.screens.map((s) => (s.id === screenId ? { ...s, components: [...s.components, created] } : s)),
      })),
    }));
    setSelectedComponentId(created.id);
  }

  function reorderComponentsInState(screenId, reorderedComponents) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => ({
        ...m,
        screens: m.screens.map((s) => (s.id === screenId ? { ...s, components: reorderedComponents } : s)),
      })),
    }));
  }

  function addScreenToState(moduleId, created) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => (m.id === moduleId ? { ...m, screens: [...m.screens, created] } : m)),
    }));
  }

  function removeScreenFromState(moduleId, screenId) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => (m.id === moduleId ? { ...m, screens: m.screens.filter((s) => s.id !== screenId) } : m)),
    }));
    if (selectedScreen?.id === screenId) setSelectedComponentId(null);
  }

  async function handleDeleteScreen(moduleId, screenId, screenTitle) {
    if (!confirm(`Видалити екран «${screenTitle}» разом з усіма його компонентами?`)) return;
    const res = await fetch(`/api/admin/screens/${screenId}`, { method: "DELETE" });
    if (res.ok) removeScreenFromState(moduleId, screenId);
  }

  function updateModuleInState(updated) {
    setCourse((c) => ({ ...c, modules: c.modules.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)) }));
  }

  function removeModuleFromState(moduleId) {
    setCourse((c) => ({ ...c, modules: c.modules.filter((m) => m.id !== moduleId) }));
  }

  function addModuleToState(created) {
    setCourse((c) => ({ ...c, modules: [...c.modules, created] }));
  }

  // Drag-and-drop модулів прямо в редакторі (не лише на дашборді) —
  // оптимістичне оновлення порядку локально + збереження order (1..N)
  // кожного модуля через PATCH.
  function handleModuleDrop(targetIndex) {
    if (dragModuleIndex === null || dragModuleIndex === targetIndex) {
      setDragModuleIndex(null);
      setOverModuleIndex(null);
      return;
    }
    const reordered = [...course.modules];
    const [moved] = reordered.splice(dragModuleIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((m, i) => ({ ...m, order: i + 1 }));
    setCourse((c) => ({ ...c, modules: withOrder }));
    Promise.all(
      withOrder.map((courseModule, i) =>
        fetch(`/api/admin/modules/${courseModule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i + 1 }),
        })
      )
    );
    setDragModuleIndex(null);
    setOverModuleIndex(null);
  }

  // Деривативи нижче й ефект після них рахуються БЕЗУМОВНО (з безпечним
  // фолбеком на порожній курс) — early return на loadError/!course
  // винесено аж перед JSX-рендером, щоб не порушувати Rules of Hooks
  // (useEffect має викликатись в однаковому порядку на кожен рендер, а не
  // пропускатись, поки course ще не завантажився).
  const allScreens = (course?.modules ?? []).flatMap((m) => m.screens);
  const selectedComponent = allScreens.flatMap((s) => s.components).find((comp) => comp.id === selectedComponentId);
  const selectedScreen = allScreens.find((s) => s.components.some((comp) => comp.id === selectedComponentId));
  const selectedModule = (course?.modules ?? []).find((m) => m.screens.some((s) => s.id === selectedScreen?.id));

  // Плаский список УСІХ компонентів курсу в порядку проходження — для
  // "Попередній/Наступний компонент" зліва (крок редагування, не крок
  // проходження — той тепер по ЕКРАНАХ, див. previewComponents нижче) і
  // лічильника "Екран N з M" у лівій панелі.
  const flatComponents = (course?.modules ?? []).flatMap((courseModule) =>
    courseModule.screens.flatMap((screen) => screen.components.map((component) => ({ component, courseModule, screen })))
  );
  const currentIndex = flatComponents.findIndex((f) => f.component.id === selectedComponentId);

  // Компоненти поточного екрана для прев'ю — той, що зараз редагується,
  // підміняємо на його ЖИВИЙ (незбережений) стан, решта — як на сервері,
  // щоб прев'ю справді показувало ввесь екран разом, а не лише один
  // компонент, і водночас лишалось "живим" під час набору тексту.
  const previewComponents = (selectedScreen?.components ?? []).map((c) =>
    livePreviewComponent && c.id === livePreviewComponent.id ? livePreviewComponent : c
  );

  // Список ЕКРАНІВ курсу — та сама послідовність, що бачить співробітник у
  // CoursePlayer (крок = екран, а не компонент) — для "Далі"/"Назад" і
  // лічильника "N/M" САМЕ В ПРЕВ'Ю праворуч. Окремо від flatComponents/
  // currentIndex вище (той — для лівої панелі "який компонент редагувати
  // далі"): плутати їх не можна — інакше "Далі" в прев'ю перестрибувало б
  // лише на наступний КОМПОНЕНТ, а не на новий екран, як у справжньому
  // плеєрі.
  const flatScreens = (course?.modules ?? []).flatMap((courseModule) =>
    courseModule.screens.map((screen) => ({ screen, courseModule }))
  );
  const previewScreenIndex = flatScreens.findIndex((f) => f.screen.id === selectedScreen?.id);
  // Та сама наскрізна нумерація компонентів, що й у CoursePlayer.
  const componentNumbers = numberComponents(flatScreens.map((f) => f.screen));

  // Чи є що зберігати і як це зробити — приходить із самої
  // ComponentEditForm через onRegisterSave. Раніше батько виводив це
  // порівнянням livePreviewComponent із збереженим компонентом, але форма
  // знає точніше: напр. в інфо-екрана title навмисно зберігається як null,
  // і таке порівняння не сходилось би ніколи.
  const componentSaveRef = useRef(null);

  /**
   * Перехід між компонентами/екранами ЗБЕРІГАЄ поточний, а не питає
   * "перейти без збереження?". Раніше стояв confirm: він зупиняв роботу
   * на кожному кроці й пропонував вибір, якого насправді ніхто не хоче
   * ("так, втратьте мої правки"). Тепер зберігаємо мовчки й переходимо.
   *
   * Якщо збереження не вдалось (мережа, помилка сервера) — лишаємось на
   * місці: перейти означало б показати людині інший екран, поки її
   * правки нікуди не записались, а червоний рядок помилки лишився б
   * позаду.
   */
  async function selectComponent(moduleId, screenId, componentId) {
    const current = componentSaveRef.current;
    if (current?.isDirty) {
      const saved = await current.save();
      if (!saved) return;
    }
    setSelectedComponentId(componentId);
    setExpandedModuleId(moduleId);
    setExpandedScreenId(screenId);
  }

  function goToOffset(offset) {
    const target = flatComponents[currentIndex + offset];
    if (target) selectComponent(target.courseModule.id, target.screen.id, target.component.id);
  }

  /** "Далі"/"Назад" у прев'ю праворуч — перестрибує на ПЕРШИЙ компонент
   * наступного/попереднього ЕКРАНА (не наступний компонент того ж екрана),
   * бо саме так рухається справжній плеєр: один крок = один екран, хоч би
   * скільки компонентів на ньому стояло. */
  function goToScreenOffset(offset) {
    const target = flatScreens[previewScreenIndex + offset];
    const firstComponent = target?.screen.components[0];
    if (firstComponent) selectComponent(target.courseModule.id, target.screen.id, firstComponent.id);
  }

  // Браузерного "Покинути сайт?" тут навмисно НЕМАЄ (рішення користувача):
  // воно спрацьовувало на будь-який дотик до форми й блокувало навіть
  // звичайний перехід за посиланням усередині адмінки.
  //
  // Замість діалогу правки зберігаються при переході між
  // компонентами/екранами, по кнопці «Зберегти» і ще раз — при самому
  // закритті вкладки (ComponentEditForm, слухач pagehide з keepalive).

  async function handleDuplicateComponent(component) {
    const screen = allScreens.find((s) => s.components.some((comp) => comp.id === component.id));
    if (!screen) return;
    const res = await fetch("/api/admin/components", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        screenId: screen.id,
        title: component.title ? `${component.title} (копія)` : null,
        type: component.type,
        order: screen.components.length + 1,
        content: component.content,
      }),
    });
    if (res.ok) addComponentToState(screen.id, await res.json());
  }

  if (loadError) return <p className="admin-page admin-error">Не вдалося завантажити курс: {loadError}</p>;
  if (!course)
    return (
      <p className="admin-page">
        <SpinnerIcon />
        Завантаження…
      </p>
    );

  return (
    <div className="admin-editor">
      <div className="admin-editor-header">
        <div>
          <Link href="/admin" className="admin-btn-link">
            ← Курси
          </Link>
          <h1>{course.title}</h1>
        </div>
      </div>

      {/* is-laptop-preview — коли курс узгоджено на "Ноутбук", докнута
          колонка справа не показує сам мокап (він однаково відкривається
          лише в модалці, .admin-laptop-preview-placeholder) — тож їй не
          треба 30% ширини заради самої кнопки "Відкрити прев'ю", і
          редактор отримує решту простору назад. */}
      <div className={`admin-editor-grid${course.previewDevice === "laptop" ? " is-laptop-preview" : ""}`}>
        <div className="admin-editor-edit">
          {course.modules.map((courseModule, moduleIndex) => {
            const isModuleExpanded = expandedModuleId === courseModule.id;
            const moduleComponentCount = courseModule.screens.reduce((n, s) => n + s.components.length, 0);
            return (
              <section
                key={courseModule.id}
                className={`admin-block${overModuleIndex === moduleIndex && dragModuleIndex !== null && dragModuleIndex !== moduleIndex ? " admin-drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverModuleIndex(moduleIndex);
                }}
                onDragLeave={() => setOverModuleIndex((v) => (v === moduleIndex ? null : v))}
                onDrop={() => handleModuleDrop(moduleIndex)}
              >
                <ModuleHeader
                  courseModule={courseModule}
                  expanded={isModuleExpanded}
                  onToggleExpand={() => setExpandedModuleId(isModuleExpanded ? null : courseModule.id)}
                  summary={`${pluralize(courseModule.screens.length, "екран", "екрани", "екранів")} · ${pluralize(moduleComponentCount, "компонент", "компоненти", "компонентів")}`}
                  onSaved={updateModuleInState}
                  onDeleted={removeModuleFromState}
                  dragHandleProps={{
                    draggable: true,
                    onDragStart: () => setDragModuleIndex(moduleIndex),
                    onDragEnd: () => {
                      setDragModuleIndex(null);
                      setOverModuleIndex(null);
                    },
                  }}
                />

                {isModuleExpanded && (
                  <div className="admin-accordion-body">
                    {courseModule.screens.map((screen) => {
                      const isScreenExpanded = expandedScreenId === screen.id;
                      return (
                        <section key={screen.id} className="admin-module">
                          <ScreenHeader
                            screen={screen}
                            expanded={isScreenExpanded}
                            onToggleExpand={() => setExpandedScreenId(isScreenExpanded ? null : screen.id)}
                            summary={pluralize(screen.components.length, "компонент", "компоненти", "компонентів")}
                            onDelete={() => handleDeleteScreen(courseModule.id, screen.id, screen.title)}
                          />

                          {isScreenExpanded && (
                            <div className="admin-accordion-body">
                              <ComponentNavList
                                components={screen.components}
                                selectedComponentId={selectedComponentId}
                                onSelect={(componentId) => selectComponent(courseModule.id, screen.id, componentId)}
                                onReordered={(reordered) => reorderComponentsInState(screen.id, reordered)}
                              />
                              <NewComponentForm
                                screenId={screen.id}
                                nextOrder={screen.components.length + 1}
                                onCreated={(created) => addComponentToState(screen.id, created)}
                              />
                            </div>
                          )}
                        </section>
                      );
                    })}

                    <NewScreenForm
                      moduleId={courseModule.id}
                      nextOrder={courseModule.screens.length + 1}
                      onCreated={(created) => {
                        addScreenToState(courseModule.id, created);
                        setExpandedScreenId(created.id);
                      }}
                    />
                  </div>
                )}
              </section>
            );
          })}

          <NewModuleForm
            courseId={course.id}
            nextOrder={course.modules.length + 1}
            onCreated={(created) => {
              addModuleToState(created);
              setExpandedModuleId(created.id);
            }}
          />

          {selectedComponent && selectedScreen && selectedModule && (
            <div className="admin-lesson-editor-panel">
              <div className="admin-breadcrumb">
                <span>{selectedModule.title}</span>
                <span className="admin-breadcrumb-sep">›</span>
                <span>{selectedScreen.title}</span>
                <span className="admin-breadcrumb-sep">·</span>
                <span>
                  Екран {currentIndex + 1} з {flatComponents.length}
                </span>
              </div>
              <ComponentEditForm
                key={selectedComponent.id}
                component={selectedComponent}
                onSaved={(updated) => updateComponentInState(selectedScreen.id, updated)}
                onDeleted={(id) => removeComponentFromState(selectedScreen.id, id)}
                onDuplicate={handleDuplicateComponent}
                onLiveChange={setLivePreviewComponent}
                onRegisterSave={(api) => {
                  componentSaveRef.current = api;
                }}
              />
              <div className="admin-row admin-lesson-step-nav">
                <button
                  type="button"
                  className="admin-btn-link"
                  onClick={() => goToOffset(-1)}
                  disabled={currentIndex <= 0}
                  title="Перейти до редагування попереднього екрану курсу"
                >
                  ← Попередній екран
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => goToOffset(1)}
                  disabled={currentIndex < 0 || currentIndex >= flatComponents.length - 1}
                  title="Перейти до редагування наступного екрану курсу"
                >
                  Наступний екран →
                </button>
              </div>
            </div>
          )}
        </div>

        <ComponentPreview
          components={previewComponents}
          componentNumbers={componentNumbers}
          stepNumber={previewScreenIndex + 1}
          totalSteps={flatScreens.length}
          onBack={() => goToScreenOffset(-1)}
          onNext={() => goToScreenOffset(1)}
          canGoBack={previewScreenIndex > 0}
          canGoNext={previewScreenIndex >= 0 && previewScreenIndex < flatScreens.length - 1}
          previewDevice={course.previewDevice || "phone"}
          onRunCourse={() => setRunPreview(true)}
        />
        {runPreview && <CourseRunPreview course={course} onClose={() => setRunPreview(false)} />}
      </div>
    </div>
  );
}
