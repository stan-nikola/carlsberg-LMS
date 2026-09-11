"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ComponentScreen, QuizScreen } from "@/components/CoursePlayer";
import { ChevronIcon, GripIcon, SpinnerIcon } from "@/components/icons";
import { pluralize } from "@/lib/pluralize";
import { COMPONENT_TYPES, COMPONENT_TYPE_LABELS, defaultContentForType } from "@/lib/componentTypes";
import { ListRowControls, useListOps } from "@/components/ListEditor";

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

function ImagePicker({ image, onChange, onRemove, onUploadingChange }) {
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
        <button type="button" onClick={onRemove} className="admin-icon-btn" aria-label="Видалити зображення" title="Видалити це зображення">
          ✕
        </button>
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

  function updateImage(index, next) {
    onChange(images.map((img, i) => (i === index ? next : img)));
  }
  function removeImage(index) {
    onChange(images.filter((_, i) => i !== index));
  }
  function addImage() {
    onChange([...images, { url: "", caption: "" }]);
  }

  return (
    <div className="admin-field">
      <label className="admin-label">Зображення</label>
      {images.map((img, i) => (
        <ImagePicker
          key={i}
          image={img}
          onChange={(next) => updateImage(i, next)}
          onRemove={() => removeImage(i)}
          onUploadingChange={(isUploading) => reportUploading(i, isUploading)}
        />
      ))}
      <button type="button" onClick={addImage} className="admin-btn-link" title="Додати ще один слот під фото">
        + Додати зображення
      </button>
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
      <div className="admin-field">
        <label className="admin-label">
          Текст екрану{" "}
          <span className="admin-hint">
            — обгорніть слово подвійними зірочками, наприклад **<b>так</b>**, щоб зробити його{" "}
            <b>жирним</b>; порожній рядок = новий абзац
          </span>
        </label>
        <textarea value={c.body} onChange={(e) => set("body")(e.target.value)} rows={5} className="admin-textarea" />
      </div>
      <ImageListEditor images={c.images} onChange={set("images")} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Підказка «Варто знати» <span className="admin-hint">— розгортається по кліку (акордеон), не видима одразу</span>
        </label>
        <textarea value={c.note} onChange={(e) => set("note")(e.target.value)} rows={2} className="admin-textarea" />
      </div>
    </>
  );
}

function QuizFields({ content, onChange, radioGroupName }) {
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
      <OptionListEditor options={c.options} onChange={set("options")} />
    </>
  );
}

/* ============ Конструктор інтерактивних екранів ============
   Механіки портовані з попередньої vanilla-JS розробки "8 кроків
   телесейлінгу" (див. lib/componentTypes.js). Спільне для всіх: рубрика +
   вступний рядок + власний список елементів, кожен з яких можна
   переставити/видалити, плюс необов'язковий текст-підказка гейта. */

/** Спільні поля-шапка (рубрика/вступ) — щоб не дублювати в кожному типі. */
function ScreenHeaderFields({ c, set }) {
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
function AccordionFields({ content, onChange }) {
  const c = { kicker: "", lead: "", gateMsg: "", ...content, items: content.items || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const ops = useListOps(c.items, set("items"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} />
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

function ChecklistFields({ content, onChange }) {
  const c = { kicker: "", lead: "", gateMsg: "", ...content, items: content.items || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const ops = useListOps(c.items, set("items"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} />
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

const BUBBLE_ROLES = [
  { value: "me", label: "Ви кажете" },
  { value: "client", label: "Клієнт" },
  { value: "tip", label: "Порада" },
  { value: "note", label: "Ремарка" },
];

function ScriptFields({ content, onChange }) {
  const c = { kicker: "", lead: "", gateMsg: "", callLabel: "Дзвінок із клієнтом", ...content, bubbles: content.bubbles || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const ops = useListOps(c.bubbles, set("bubbles"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} />
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

function TimelineFields({ content, onChange }) {
  const c = { kicker: "", lead: "", gateMsg: "", highlight: null, ...content, steps: content.steps || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const ops = useListOps(c.steps, set("steps"));

  return (
    <>
      <ScreenHeaderFields c={c} set={set} />
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
      return <QuizFields content={content} onChange={onChange} radioGroupName={`qtype-${componentId}`} />;
    case "accordion":
      return <AccordionFields content={content} onChange={onChange} />;
    case "checklist":
      return <ChecklistFields content={content} onChange={onChange} />;
    case "script":
      return <ScriptFields content={content} onChange={onChange} />;
    case "timeline":
      return <TimelineFields content={content} onChange={onChange} />;
    case "photo":
      return <PhotoFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "input":
      return <InputFields content={content} onChange={onChange} />;
    default:
      return <InfoFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
  }
}

/** Тільки поля форми правки (без грід-обгортки) — рендериться в лівій
 * колонці спільного admin-editor-grid разом з навігацією по екранах. */
function ComponentEditForm({ component, onSaved, onDeleted, onDuplicate, onLiveChange }) {
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
  const isDirty =
    title !== (component.title || "") ||
    type !== component.type ||
    JSON.stringify(content) !== JSON.stringify(component.content);

  function handleTypeChange(newType) {
    setType(newType);
    setContent(defaultContentForType(newType));
  }

  async function handleSave() {
    // Фото ще вантажиться (в тому ж content.images) — url на цю мить
    // порожній, зберегти зараз означало б записати екран без фото.
    if (imageUploading) {
      setError("Зачекайте, поки фото завантажиться, і збережіть ще раз.");
      return;
    }
    if (type === "quiz" && !title.trim()) {
      setError("Для питання заголовок (текст питання) обов'язковий.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/components/${component.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || null, type, content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(await res.json());
    } catch (err) {
      setError("Помилка збереження: " + err.message);
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
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "quiz" ? "Текст питання" : "Назва (лише для адмінки)"}
          className="admin-input-flex admin-title-input"
        />
        <select
          value={type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="admin-select"
          title={COMPONENT_TYPES.find((t) => t.value === type)?.hint}
        >
          {COMPONENT_TYPES.map((t) => (
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
 * Права колонка показує ЦІЛИЙ поточний екран — усі його компоненти стеком
 * (components), не лише той один, що зараз редагується зліва: інакше автор
 * не побачив би, як насправді виглядає екран з кількома компонентами разом
 * (саме це раніше "губилось" — прев'ю рендерив лише вибраний component).
 * components[] — уже змержений список: той, що зараз редагується, замінено
 * на його ЖИВИЙ (незбережений) стан, решта — як збережено на сервері.
 */
function ComponentPreview({ components, stepNumber, totalSteps, onBack, onNext, canGoBack, canGoNext }) {
  const hasScreen = components && components.length > 0;
  // Той самий скрол-контейнер, що й у реальному плеєрі (.cp-viewport) — той
  // самий фікс: без явного скидання наступний екран у прев'ю відкривався
  // "з середини", якщо попередній був прогорнутий вниз.
  const viewportRef = useRef(null);
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [stepNumber]);
  return (
    <div className="admin-editor-preview">
      <div className="iphone-mockup">
        <div className="course-card">
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
                    {component.type === "quiz" ? (
                      <PreviewQuiz component={component} />
                    ) : (
                      // Той самий диспетчер, що й у плеєрі — інтерактивні екрани в
                      // прев'ю справді клікаються (картки розгортаються, репліки
                      // з'являються), щоб автор одразу перевірив механіку, а не
                      // здогадувався по полях форми. key — щоб при перемиканні
                      // типу внутрішній стан взаємодії починався з нуля.
                      <ComponentScreen key={`${component.id}-${component.type}`} component={component} screenNumber={stepNumber} />
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
        <IPhoneFrame />
      </div>
    </div>
  );
}

/** Обгортка над QuizScreen з власним локальним станом відповіді — щоб
 * прев'ю в /admin можна було "клікнути" так само, як побачить співробітник,
 * не чіпаючи реальний Enrollment. */
function PreviewQuiz({ component }) {
  const [answer, setAnswer] = useState(undefined);
  // Скидаємо відповідь у прев'ю щоразу, як екран/його вміст змінюється —
  // ефект, а не похідний стан, бо триґериться і зі стабільним component.id
  // (правки контенту вживу), не тільки при зміні обраного екрана.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setAnswer(undefined), [component.id, component.content]);
  return <QuizScreen component={component} screenNumber={1} answer={answer} onAnswer={setAnswer} />;
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

  // livePreviewComponent дублює поточний стан форми (ComponentEditForm її
  // туди прокидає щокрок для живої прев'ю) — порівнюючи його з
  // selectedComponent (те, що реально збережено на сервері), знаємо, чи є
  // незбережені правки, не піднімаючи власний dirty-стан із дочірньої
  // форми окремим пропсом.
  const isCurrentComponentDirty =
    selectedComponent &&
    livePreviewComponent &&
    livePreviewComponent.id === selectedComponent.id &&
    (livePreviewComponent.title !== selectedComponent.title ||
      livePreviewComponent.type !== selectedComponent.type ||
      JSON.stringify(livePreviewComponent.content) !== JSON.stringify(selectedComponent.content));

  function selectComponent(moduleId, screenId, componentId) {
    if (
      isCurrentComponentDirty &&
      !confirm("На поточному екрані є незбережені зміни. Перейти без збереження?")
    ) {
      return;
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

  // Попереджаємо і про закриття вкладки/перехід за посиланням — не лише
  // про перемикання екрана всередині самого редактора.
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!isCurrentComponentDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isCurrentComponentDirty]);

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
        <span className="admin-hint">/{course.slug}</span>
      </div>

      <div className="admin-editor-grid">
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
          stepNumber={previewScreenIndex + 1}
          totalSteps={flatScreens.length}
          onBack={() => goToScreenOffset(-1)}
          onNext={() => goToScreenOffset(1)}
          canGoBack={previewScreenIndex > 0}
          canGoNext={previewScreenIndex >= 0 && previewScreenIndex < flatScreens.length - 1}
        />
      </div>
    </div>
  );
}
