"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ComponentScreen, QuizScreen, CoursePlayer } from "@/components/CoursePlayer";
import { HotspotScreen } from "@/components/ScreenComponents";
import { OrderingScreen, MatchingScreen } from "@/components/QuestionScreens";
import { ChevronIcon, GripIcon, PencilIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { pluralize } from "@/lib/pluralize";
import { COMPONENT_TYPES, COMPONENT_TYPE_LABELS, RETIRED_COMPONENT_TYPES, defaultContentForType, isScored } from "@/lib/componentTypes";
import { ListRowControls, useListOps } from "@/components/ListEditor";
import { HintDot } from "@/components/HintDot";
import { numberComponents } from "@/lib/coursePlayerLogic";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useDragReorder } from "@/lib/useDragReorder";
import { HANDLES, boxFromDrag, moveBox, resizeBox, tapBox, toBox, zoneShapeClass, zoneStyle } from "@/lib/hotspotZones";
import { parseVideoEmbed } from "@/lib/videoEmbed";

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

function ImagePicker({ image, index, total, onChange, onMove, onRemove, onUploadingChange, allowVideo }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Відео — це посилання, а не файл (lib/videoEmbed.ts): те саме поле
  // приймає і шлях до фото, і адресу ролика, тож тип визначаємо з самого
  // значення, а не окремою кнопкою.
  const embed = allowVideo ? parseVideoEmbed(image.url || "") : null;
  const linkNotRecognized = allowVideo && !embed && /youtu|vimeo|tiktok|facebook|instagram|rutube/i.test(image.url || "");

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
      // kind/poster скидаємо явно: слот міг бути відео, і без цього на
      // екрані лишився б плеєр зі старим постером поверх нового фото.
      onChange({ ...image, url: data.url, kind: "photo", poster: "" });
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  return (
    <div className="admin-image-picker">
      {image.url &&
        (embed ? (
          <iframe
            src={embed.src}
            title={embed.title}
            className="admin-video-preview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <img src={image.url} alt="" className="admin-image-preview" />
        ))}
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
          placeholder={allowVideo ? "або посилання на YouTube / Vimeo" : "або встав URL /assets/…"}
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
      <p className="admin-hint">
        Формати: JPEG, PNG, WebP, GIF · до 8 МБ.
        {allowVideo && " Відео — вставте посилання на YouTube або Vimeo в те саме поле; плеєр з'явиться просто на екрані."}
      </p>
      <input
        placeholder="підпис (необов'язково)"
        value={image.caption}
        onChange={(e) => onChange({ ...image, caption: e.target.value })}
        className="admin-input-flex"
      />
      {uploadError && <p className="admin-error">{uploadError}</p>}
      {/* Мовчазний провал розпізнавання — найгірше, що тут може бути:
          автор вставив посилання, побачив порожньо і не знає, чому. Тому
          на адресу з відеосервісу, яку не змогли розібрати, кажемо прямо. */}
      {linkNotRecognized && (
        <p className="admin-warning">
          Не вдалося розпізнати посилання. Підтримуються YouTube і Vimeo — скопіюйте адресу зі сторінки ролика
          (youtube.com/watch?v=… , youtu.be/… , vimeo.com/…).
        </p>
      )}
    </div>
  );
}

function ImageListEditor({ images, onChange, onUploadingChange, max = MAX_IMAGES, limitHint, allowVideo }) {
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
  const atLimit = images.length >= max;

  return (
    <div className="admin-field">
      <label className="admin-label">
        {allowVideo ? "Фото та відео" : "Зображення"}{" "}
        <span className="admin-hint">{max === 1 ? "— одне на це питання" : `— до ${max}, порядок задають стрілки`}</span>
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
          allowVideo={allowVideo}
        />
      ))}
      {atLimit ? (
        <p className="admin-hint">{limitHint || `Більше ${max} фото на один екран не додати — заберіть зайве, щоб додати інше.`}</p>
      ) : (
        <button type="button" onClick={() => ops.add({ url: "", caption: "" })} className="admin-btn-link" title="Додати ще один слот під фото">
          {allowVideo ? "+ Додати фото або відео" : "+ Додати зображення"}
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
function RichTextArea({ value, onChange, rows = 5, className = "admin-textarea", placeholder, paragraphs = true }) {
  const ref = useRef(null);
  const pendingSelection = useRef(null);
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

  function applyMark(mark) {
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
        <RichTextArea value={c.lead} onChange={set("lead")} rows={2} paragraphs={false} />
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
        <RichTextArea value={c.note} onChange={set("note")} rows={2} />
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

/* ============ Конструктор інтерактивних екранів ============
   Механіки портовані з попередньої vanilla-JS розробки "8 кроків
   телесейлінгу" (див. lib/componentTypes.js). Спільне для всіх: рубрика +
   вступний рядок + власний список елементів, кожен з яких можна
   переставити/видалити, плюс необов'язковий текст-підказка гейта. */

/** Спільні поля-шапка (рубрика/вступ) — щоб не дублювати в кожному типі. */
function ScreenHeaderFields({ c, set, onUploadingChange, maxImages, imagesLimitHint }) {
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

/** Екран "фото та відео" — ті самі текстові поля, що в info (рубрика,
 *  вступний рядок, «Варто знати»), але без «Тексту екрану»: довга стаття
 *  під фото — це вже інфо-екран, а не показ одного знімка чи ролика.
 *  Порядок полів збігається з порядком на екрані співробітника.
 *
 *  Відео дозволене ЛИШЕ тут: у питанні (quiz, hotspot, ordering) ролик
 *  означав би, що відповідь треба спершу додивитись, а гейта «переглянув»
 *  у системі немає. */
function PhotoFields({ content, onChange, onUploadingChange }) {
  const c = { kicker: "", lead: "", note: "", ...content, images: content.images || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
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

/** Поле "довільний ввід" — лише підпис/плейсхолдер, значення ніде не
 * зберігається (гейт "щось введено", перевіряється в плеєрі). */
const HOTSPOT_SHAPES = [
  { value: "rect", label: "Прямокутник", title: "Прямокутник або квадрат — обвести полицю, цінник, half кадру" },
  { value: "ellipse", label: "Овал", title: "Овал або коло — обвести пляшку, кегу, логотип" },
];

/**
 * Гаряча точка на фото. Зона малюється ПРОТЯЖКОЮ прямо по зображенню, як
 * у будь-якому графічному редакторі (той самий жест, що в Storyline і
 * H5P): протягнув — з'явилась рамка, потягнув за кут — змінив розмір, за
 * середину — посунув. Форма рамки ("прямокутник" чи "овал") дає всі
 * чотири потрібні фігури, включно з квадратом і колом.
 *
 * Жести — на Pointer Events, тобто однакові для миші й пальця; touch-action
 * на канві вимкнено, інакше протяжка гортала б сторінку замість малювання.
 * Просто тап (без руху) ставить зону типового розміру — щоб не змушувати
 * «малювати» там, де досить ткнути.
 *
 * Уся математика — lib/hotspotZones.ts (з тестами): нею ж плеєр показує
 * зони й зараховує влучання, тож розійтись вони не можуть.
 *
 * Координати й розміри — у ВІДСОТКАХ (ширина від ширини кадру, висота від
 * висоти): те саме фото показується на телефоні й на ноутбуці різного
 * розміру, піксельні значення там розійшлися б.
 */
function HotspotFields({ content, onChange, onUploadingChange }) {
  const c = { kicker: "", lead: "", explanation: "", ...content, images: content.images || [], zones: content.zones || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const [shape, setShape] = useState("rect");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const image = c.images.find((img) => img.url);

  /** Точка події у відсотках кадру + пропорції самого кадру. */
  function readPointer(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      at: { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 },
      aspect: rect.height / rect.width,
    };
  }

  const replaceZone = (index, zone) => set("zones")(c.zones.map((z, i) => (i === index ? zone : z)));

  function onPointerDown(e) {
    if (e.button > 0) return;
    const read = readPointer(e);
    if (!read) return;
    const handle = e.target.dataset?.handle;
    const zoneAttr = e.target.closest?.("[data-zone]")?.dataset?.zone;
    canvasRef.current.setPointerCapture(e.pointerId);

    if (handle && selected != null) {
      // Стару круглу зону переводимо в рамку рівно в мить, коли автор сам
      // узявся її правити — мовчазної масової міграції не робимо.
      dragRef.current = { mode: "resize", handle, origin: toBox(c.zones[selected], read.aspect) };
    } else if (zoneAttr != null) {
      const index = Number(zoneAttr);
      setSelected(index);
      dragRef.current = { mode: "move", start: read.at, origin: toBox(c.zones[index], read.aspect), index };
    } else {
      setSelected(null);
      dragRef.current = { mode: "draw", start: read.at, aspect: read.aspect, moved: false };
    }
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const read = readPointer(e);
    if (!read) return;
    if (drag.mode === "draw") {
      // Поріг у 1%: інакше звичайний тап тремтячою рукою малював би
      // зону-ниточку замість зони типового розміру.
      drag.moved = drag.moved || Math.abs(read.at.x - drag.start.x) > 1 || Math.abs(read.at.y - drag.start.y) > 1;
      if (drag.moved) setDraft(boxFromDrag(drag.start, read.at, shape));
    } else if (drag.mode === "move") {
      replaceZone(drag.index, moveBox(drag.origin, read.at.x - drag.start.x, read.at.y - drag.start.y));
    } else if (drag.mode === "resize") {
      replaceZone(selected, resizeBox(drag.origin, drag.handle, read.at));
    }
  }

  function onPointerUp(e) {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    if (drag?.mode !== "draw") return;
    const read = readPointer(e);
    if (!read) return;
    const zone = drag.moved ? boxFromDrag(drag.start, read.at, shape) : tapBox(drag.start, shape, drag.aspect);
    set("zones")([...c.zones, zone]);
    setSelected(c.zones.length);
  }

  /** Перемикач форми правит і ОБРАНУ зону, і задає форму для наступних. */
  function chooseShape(value) {
    setShape(value);
    if (selected == null || !c.zones[selected]) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const aspect = rect?.width ? rect.height / rect.width : 1;
    replaceZone(selected, { ...toBox(c.zones[selected], aspect), shape: value });
  }

  return (
    <>
      {/* РІВНО одне фото на питання — як у H5P Find the Hotspot і в
          хотспоті Storyline. Друге зображення тут було мертвим вантажем:
          зони ставились лише по першому, і плеєр теж показував лише його,
          тобто автор витрачав час на фото, якого ніхто не побачить
          (скарга користувача 2026-09-23). Потрібно два таких питання —
          це два блоки «гаряча точка», і їх можна покласти на ОДИН екран,
          другий екран заводити не треба. */}
      <ScreenHeaderFields
        c={c}
        set={set}
        onUploadingChange={onUploadingChange}
        maxImages={1}
        imagesLimitHint="Одне фото на питання: зони ставляться саме по ньому. Потрібне друге фото — додайте ще один блок «гаряча точка» на цей самий екран."
      />
      <div className="admin-field">
        <label className="admin-label">
          Правильні зони{" "}
          <span className="admin-hint">— проведіть по фото, щоб обвести місце; влучанням вважається будь-яка зона</span>
        </label>
        {!image ? (
          <p className="admin-hint">Спочатку додайте фото вище — зони малюються прямо по ньому.</p>
        ) : (
          <>
            <div className="admin-row adm-hotspot-tools">
              <span className="admin-hint">Форма:</span>
              {HOTSPOT_SHAPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`adm-hotspot-shape${shape === s.value ? " is-on" : ""}`}
                  onClick={() => chooseShape(s.value)}
                  title={s.title}
                  aria-pressed={shape === s.value}
                >
                  <span className={`adm-hotspot-shape-ico is-${s.value}`} aria-hidden="true" />
                  {s.label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="admin-btn-link"
                onClick={() => {
                  set("zones")(c.zones.filter((_, i) => i !== selected));
                  setSelected(null);
                }}
                disabled={selected == null}
              >
                Видалити обрану
              </button>
              <button
                type="button"
                className="admin-btn-link"
                onClick={() => {
                  set("zones")([]);
                  setSelected(null);
                }}
                disabled={c.zones.length === 0}
              >
                Очистити зони
              </button>
            </div>
            {/* Звичайний <img>, а не next/image: тут важлива рівно та
                геометрія, по якій рахуються відсоткові координати, без
                будь-якого ресайзу під капотом. */}
            <div
              ref={canvasRef}
              className="adm-hotspot-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="presentation"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" draggable={false} />
              {c.zones.map((z, i) => (
                <span
                  key={i}
                  data-zone={i}
                  className={`adm-hotspot-zone ${zoneShapeClass(z)}${selected === i ? " is-selected" : ""}`}
                  style={zoneStyle(z)}
                >
                  <b className="adm-hotspot-num">{i + 1}</b>
                  {selected === i &&
                    HANDLES.map((h) => <i key={h} data-handle={h} className={`adm-hotspot-handle is-${h}`} />)}
                </span>
              ))}
              {draft && (
                <span
                  className={`adm-hotspot-zone is-draft ${draft.shape === "rect" ? "is-rect" : "is-ellipse"}`}
                  style={zoneStyle(draft)}
                />
              )}
            </div>
            <p className="admin-hint">
              {c.zones.length === 0
                ? "Жодної зони — питання поки не має правильної відповіді."
                : `Зон: ${c.zones.length}. Натисніть на зону, щоб обрати: далі її можна посунути або потягнути за кут.`}
            </p>
          </>
        )}
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Пояснення до відповіді <span className="admin-hint">— показується ПІСЛЯ відповіді, і правильної теж</span>
        </label>
        <RichTextArea
          value={c.explanation}
          onChange={set("explanation")}
          rows={2}
          paragraphs={false}
          placeholder="Чому саме це місце — коротко"
        />
      </div>
    </>
  );
}

/**
 * «Фото з точками» — пояснялка, не питання. Точка ставиться тапом прямо
 * по фото (як зони hotspot), підпис до неї — у списку нижче: поле для
 * тексту поверх самого знімка перекривало б те, що автор пояснює.
 *
 * Номер точки в списку збігається з номером на фото, тож зіставляти
 * «третій рядок — третя точка» не треба; обрана точка підсвічується з
 * обох боків одразу.
 */
function ImagePinsFields({ content, onChange, onUploadingChange }) {
  const c = {
    kicker: "",
    lead: "",
    pinShape: "circle",
    pinSize: 8,
    ...content,
    images: content.images || [],
    pins: content.pins || [],
  };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const [selected, setSelected] = useState(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  // Чи щойно тягнули точку: браузер шле click ПІСЛЯ pointerup, і без цього
  // прапорця перетягування закінчувалось би появою зайвої точки під пальцем.
  const justDraggedRef = useRef(false);
  const image = c.images.find((img) => img.url);
  const setPin = (i, field, value) => set("pins")(c.pins.map((p, j) => (j === i ? { ...p, [field]: value } : p)));

  /** Координати події у відсотках кадру, обрізані по його межах. */
  function pctFromEvent(e) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    const clamp = (v) => Math.min(100, Math.max(0, v));
    return {
      x: Number(clamp(((e.clientX - rect.left) / rect.width) * 100).toFixed(1)),
      y: Number(clamp(((e.clientY - rect.top) / rect.height) * 100).toFixed(1)),
    };
  }

  function addPin(at) {
    // Нова точка зі списку (кнопкою) стає не рівно в центр, а сходинкою:
    // інакше друга й третя лягли б одна на одну, і автор бачив би лише
    // верхню.
    const step = (c.pins.length % 5) * 6;
    set("pins")([...c.pins, { x: at?.x ?? 42 + step, y: at?.y ?? 42 + step, title: "", text: "" }]);
    setSelected(c.pins.length);
  }

  function onCanvasPointerDown(e) {
    const idx = e.target.dataset?.pin;
    if (idx == null) return;
    // Тягнемо точку — клік по фото (додати нову) при цьому не спрацює:
    // його гасить перевірка dragRef у onCanvasClick.
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    dragRef.current = { index: Number(idx), moved: false };
    setSelected(Number(idx));
  }

  function onCanvasPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const at = pctFromEvent(e);
    if (!at) return;
    drag.moved = true;
    set("pins")(c.pins.map((p, j) => (j === drag.index ? { ...p, x: at.x, y: at.y } : p)));
  }

  function onCanvasPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    // Прапорець живе до наступного кліку: браузер шле click ПІСЛЯ
    // pointerup, і без цього перетягування закінчувалось би ще й появою
    // зайвої точки під пальцем.
    justDraggedRef.current = Boolean(drag?.moved);
  }

  function onCanvasClick(e) {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    if (e.target.dataset?.pin != null) return;
    const at = pctFromEvent(e);
    if (at) addPin(at);
  }

  return (
    <>
      <ScreenHeaderFields
        c={c}
        set={set}
        onUploadingChange={onUploadingChange}
        maxImages={1}
        imagesLimitHint="Одне фото на екран: точки ставляться саме по ньому."
      />
      <div className="admin-field">
        <label className="admin-label">
          Точки на фото <span className="admin-hint">— натисніть по фото, щоб додати; «Далі» відкриється, коли співробітник відкриє ВСІ</span>
        </label>
        {!image ? (
          <p className="admin-hint">Спочатку додайте фото вище — точки ставляться прямо по ньому.</p>
        ) : (
          <>
            {/* Форма й розмір — над самим фото, щоб зміну було видно
                одразу на всіх маркерах (рішення користувача 2026-09-23:
                головне, щоб на знімку вони були ОДНАКОВІ, тож налаштування
                одне на компонент, а не в кожної точки). */}
            <div className="admin-row adm-hotspot-tools">
              <span className="admin-hint">Маркер:</span>
              {[
                { value: "circle", label: "Коло" },
                { value: "square", label: "Квадрат" },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`adm-hotspot-shape${c.pinShape === s.value ? " is-on" : ""}`}
                  onClick={() => set("pinShape")(s.value)}
                  aria-pressed={c.pinShape === s.value}
                >
                  <span className={`adm-hotspot-shape-ico is-${s.value === "circle" ? "ellipse" : "rect"}`} aria-hidden="true" />
                  {s.label}
                </button>
              ))}
              <label className="admin-hint adm-pin-size">
                Розмір
                <input
                  type="range"
                  min="4"
                  max="30"
                  step="1"
                  value={c.pinSize}
                  onChange={(e) => set("pinSize")(Number(e.target.value))}
                  aria-label="Розмір маркера, % ширини фото"
                />
                <b>{c.pinSize}%</b>
              </label>
            </div>
            <div
              ref={canvasRef}
              className="adm-hotspot-canvas"
              onClick={onCanvasClick}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
              role="presentation"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" draggable={false} />
              {c.pins.map((pin, i) => (
                <span
                  key={i}
                  data-pin={i}
                  className={`adm-pin is-${c.pinShape === "square" ? "square" : "circle"}${selected === i ? " is-selected" : ""}`}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%`, width: `${c.pinSize}%` }}
                  title="Перетягніть, щоб пересунути"
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <p className="admin-hint">Натисніть по фото, щоб додати точку, або перетягніть наявну на нове місце.</p>
            {c.pins.length === 0 ? (
              <p className="admin-hint">Жодної точки — екран поки нічого не пояснює.</p>
            ) : (
              c.pins.map((pin, i) => (
                <div
                  className={`admin-lesson-card${selected === i ? " is-selected" : ""}`}
                  key={i}
                  onFocusCapture={() => setSelected(i)}
                >
                  <div className="admin-row">
                    <span className="admin-hint" style={{ minWidth: 18 }}>
                      {i + 1}
                    </span>
                    <input
                      value={pin.title || ""}
                      onChange={(e) => setPin(i, "title", e.target.value)}
                      placeholder={`Заголовок точки ${i + 1}`}
                      className="admin-input-flex admin-title-input"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        set("pins")(c.pins.filter((_, j) => j !== i));
                        setSelected(null);
                      }}
                      className="admin-icon-btn"
                      aria-label="Видалити точку"
                      title="Видалити цю точку"
                    >
                      ✕
                    </button>
                  </div>
                  <RichTextArea
                    value={pin.text}
                    onChange={(v) => setPin(i, "text", v)}
                    rows={2}
                    paragraphs={false}
                    placeholder="Що тут пояснюємо"
                  />
                </div>
              ))
            )}
            {/* Кнопка внизу списку, як і в решти списків конструктора: тап
                по фото лишається, але його треба спершу здогадатись —
                кнопка ж просто є (прохання користувача 2026-09-23).
                Нова точка з'являється в кадрі, далі її перетягують. */}
            <button type="button" onClick={() => addPin(null)} className="admin-btn-link" title="Додати ще одну точку на фото">
              + Додати точку
            </button>
          </>
        )}
      </div>
    </>
  );
}

/**
 * «До / після» — рівно два фото: перше «до», друге «після». Порядок
 * задають ті самі стрілки, що й у будь-якому списку фото, тому окремих
 * полів «оберіть фото до» тут немає.
 */
function BeforeAfterFields({ content, onChange, onUploadingChange }) {
  const c = { kicker: "", lead: "", beforeLabel: "Було", afterLabel: "Стало", ...content, images: content.images || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const ready = c.images.filter((img) => img.url).length >= 2;

  return (
    <>
      <ScreenHeaderFields
        c={c}
        set={set}
        onUploadingChange={onUploadingChange}
        maxImages={2}
        imagesLimitHint="Два фото: перше — «до», друге — «після». Порядок міняють стрілки."
      />
      <div className="admin-field">
        <label className="admin-label">
          Підписи станів{" "}
          <HintDot
            align="start"
            text="Те, що написано на перемикачі й на плашці поверх фото. Коротке слово читається краще за речення: «Було / Стало», «Неправильно / Правильно», «До візиту / Після візиту»."
          />
        </label>
        <div className="admin-row">
          <input
            value={c.beforeLabel}
            onChange={(e) => set("beforeLabel")(e.target.value)}
            placeholder="Було"
            className="admin-input-flex"
          />
          <input
            value={c.afterLabel}
            onChange={(e) => set("afterLabel")(e.target.value)}
            placeholder="Стало"
            className="admin-input-flex"
          />
        </div>
        {!ready && <p className="admin-hint">Потрібні саме два фото — поки екран показує лише попередження.</p>}
      </div>
    </>
  );
}

/** «Порядок кроків»: правильна послідовність — та, у якій кроки стоять
 *  ТУТ. Плеєр показує їх перемішаними, тож окремого поля «правильна
 *  відповідь» немає й не може розсинхронитись зі списком. */
function OrderingFields({ content, onChange, onUploadingChange }) {
  const c = { lead: "", images: [], items: [], explanation: "", ...content };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const setItem = (item, text) => set("items")(c.items.map((it) => (it === item ? { ...it, text } : it)));

  // Ідентичність рядка — сам об'єкт `it` (референс), не index: індекс
  // міняється при кожній перестановці, а setItem вище лишає референс
  // НЕЗМІННИМ для всіх рядків, крім того, що редагують просто зараз —
  // достатньо для lib/useDragReorder.ts, синтетичні id заводити не треба.
  const { containerRef, containerProps, registerRow, dragId, dragDeltaY, moveByKeyboard } = useDragReorder({
    ids: c.items,
    onReorder: set("items"),
  });

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Вступний рядок (необов&apos;язково)</label>
        <input value={c.lead} onChange={(e) => set("lead")(e.target.value)} className="admin-input-flex" placeholder="Наприклад: розставте етапи візиту" />
      </div>
      <ImageListEditor images={c.images} onChange={set("images")} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Кроки у ПРАВИЛЬНОМУ порядку{" "}
          <HintDot
            align="start"
            text="Впишіть кроки так, як вони мають іти насправді — окремого поля «правильна відповідь» немає, правильний порядок це сам цей список. Співробітнику вони покажуться перемішаними, і він відновлює послідовність перетягуванням. Зарахується лише повний збіг: часткового балу тут немає."
          />
        </label>
        <div ref={containerRef} {...containerProps}>
          {c.items.map((it, i) => (
            <div
              key={i}
              ref={registerRow(it)}
              data-drag-row
              className={`admin-row admin-option-row admin-drag-row${dragId === it ? " is-dragging" : ""}`}
              style={dragId === it ? { transform: `translateY(${dragDeltaY}px)` } : undefined}
            >
              <button
                type="button"
                className="admin-drag-handle"
                data-drag-handle
                title="Перетягніть, щоб змінити порядок кроків"
                aria-label={`Перетягніть крок «${it.text || i + 1}» — або керуйте стрілками вгору/вниз`}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    moveByKeyboard(it, -1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    moveByKeyboard(it, 1);
                  }
                }}
              >
                <GripIcon />
              </button>
              <span className="admin-hint" style={{ minWidth: 18 }}>
                {i + 1}
              </span>
              <input value={it.text || ""} onChange={(e) => setItem(it, e.target.value)} placeholder="Текст кроку" className="admin-input-flex" />
              <button
                type="button"
                onClick={() => set("items")(c.items.filter((x) => x !== it))}
                className="admin-icon-btn"
                aria-label="Видалити крок"
                title="Видалити цей крок"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set("items")([...c.items, { text: "" }])} className="admin-btn-link" title="Додати ще один крок">
          + Додати крок
        </button>
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Пояснення <span className="admin-hint">— показується після відповіді</span>
        </label>
        <RichTextArea value={c.explanation} onChange={set("explanation")} rows={2} paragraphs={false} placeholder="Чому саме такий порядок" />
      </div>
    </>
  );
}

/** «Відповідність»: пари «ліве — праве». Ліва колонка показується як є,
 *  права перемішується, тож правильна пара — це просто рядок таблиці. */
function MatchingFields({ content, onChange, onUploadingChange }) {
  const c = { lead: "", images: [], pairs: [], explanation: "", ...content };
  const set = (field) => (value) => onChange({ ...c, [field]: value });
  const setPair = (i, field, value) => set("pairs")(c.pairs.map((p, j) => (j === i ? { ...p, [field]: value } : p)));

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Вступний рядок (необов&apos;язково)</label>
        <input value={c.lead} onChange={(e) => set("lead")(e.target.value)} className="admin-input-flex" placeholder="Наприклад: зіставте бренд і категорію" />
      </div>
      <ImageListEditor images={c.images} onChange={set("images")} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Пари{" "}
          <HintDot
            align="start"
            text="Кожен рядок — одна правильна пара. Ліва колонка покажеться співробітнику в тому ж порядку, права — перемішаною; він зіставляє їх двома тапами. Три-п'ять пар читаються на телефоні найкраще: більше не вміщається на екран без прокрутки. Зарахується лише повний збіг."
          />
        </label>
        {c.pairs.map((p, i) => (
          <div className="admin-row admin-option-row" key={i}>
            <input value={p.left || ""} onChange={(e) => setPair(i, "left", e.target.value)} placeholder="Ліворуч" className="admin-input-flex" />
            <span className="admin-hint">—</span>
            <input value={p.right || ""} onChange={(e) => setPair(i, "right", e.target.value)} placeholder="Праворуч" className="admin-input-flex" />
            <button
              type="button"
              onClick={() => set("pairs")(c.pairs.filter((_, j) => j !== i))}
              className="admin-icon-btn"
              aria-label="Видалити пару"
              title="Видалити цю пару"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set("pairs")([...c.pairs, { left: "", right: "" }])} className="admin-btn-link" title="Додати ще одну пару">
          + Додати пару
        </button>
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Пояснення <span className="admin-hint">— показується після відповіді</span>
        </label>
        <RichTextArea value={c.explanation} onChange={set("explanation")} rows={2} paragraphs={false} placeholder="Що тут головне запам'ятати" />
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
    case "ordering":
      return <OrderingFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "matching":
      return <MatchingFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "imagepins":
      return <ImagePinsFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
    case "beforeafter":
      return <BeforeAfterFields content={content} onChange={onChange} onUploadingChange={onUploadingChange} />;
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

/** Логічна ширина екрана, яку емулюють ОБИДВА телефонних прев'ю —
 *  справжній iPhone Pro Max (440×956 CSS px). Рішення користувача
 *  2026-09-23: докнуте прев'ю й модалка мають показувати ОДНУ І ТУ САМУ
 *  верстку з однаковими переносами рядків, і саме ту, яку побачить
 *  співробітник; відрізнятись вони можуть лише фізичним розміром картинки. */
const PHONE_SCREEN_W = 440;

/**
 * Зум, при якому екран усередині рамки має рівно PHONE_SCREEN_W логічних
 * пікселів — хай якого фізичного розміру вийшла сама рамка.
 *
 * Чому не фіксоване число в CSS (було zoom:0.7 у докнутому і 1 у модалці):
 * рамка масштабується під доступне місце (ширина колонки / висота вікна),
 * тож при СТАЛОМУ зумі логічна ширина екрана "плаває" разом з нею — на
 * одному й тому ж проєкті виходило 513px у докнутому прев'ю й 356px у
 * модалці, і жодне з них не дорівнювало справжньому телефону (скарга
 * користувача: контент у модалці влазить зовсім не так, як у прев'ю).
 * CSS порахувати це не може: потрібне ділення довжини на довжину.
 *
 * Міряємо елемент, на якому САМЕ І СТОЇТЬ зум, і множимо його offsetWidth
 * на вже застосований зум (читаємо з DOM, а не зі стейту — так значення
 * гарантовано узгоджені між собою): offsetWidth у зумленого елемента вже
 * поділений на його зум, тож добуток — це справжня ширина в координатах
 * розкладки. Вимірювання не зациклюється: щойно зум правильний, добуток
 * перестає мінятись.
 */
function usePhoneScreenZoom(mockupRef, selector, enabled) {
  const [zoom, setZoom] = useState(null);
  useEffect(() => {
    const el = enabled ? mockupRef.current?.querySelector(selector) : null;
    if (!el) return undefined;
    const measure = () => {
      const applied = parseFloat(getComputedStyle(el).zoom) || 1;
      const real = el.offsetWidth * applied;
      if (real <= 0) return;
      const next = real / PHONE_SCREEN_W;
      // Мертва зона обов'язкова: offsetWidth цілочисельний, тож добуток
      // щоразу гуляє на ±1px, новий зум трохи інший — і ResizeObserver
      // будив би сам себе нескінченно (перевірено на замірах: 0.709 →
      // 0.707 → …). 0.5% — дрібніше за півпікселя на екрані.
      setZoom((prev) => (prev && Math.abs(prev - next) < 0.005 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mockupRef, selector, enabled]);
  return zoom;
}

/**
 * Клік по сірому тлу модалки закриває прев'ю, клік по самому пристрою — ні.
 *
 * Перевіряємо саме "чи це всередині рамки", а НЕ `e.target === e.currentTarget`
 * (як було): оверлей повністю перекритий двома розтягнутими на 100%
 * обгортками (.admin-preview-modal → -body), тож ціллю кліку по сірому
 * завжди була одна з НИХ, а не сам оверлей — і закриття не спрацьовувало
 * ніколи (скарга користувача 2026-09-23). Селектор по мокапу, а не по
 * .course-card: рамка пристрою й плашка прев'ю — теж "сам пристрій",
 * випадковий клік по них не має закривати вікно.
 */
const closeOnBackdrop = (onClose) => (e) => {
  if (!e.target.closest(".iphone-mockup, .laptop-mockup")) onClose();
};

/**
 * Сам вміст мокапу — .course-card (шапка/прогрес/контент/навігація) +
 * SVG-рамка, спільні для ДОКНУТОГО телефонного прев'ю (завжди на екрані,
 * поруч з редактором) і повноекранної модалки (components нижче) —
 * інакше довелось би тримати той самий JSX у двох місцях. device —
 * "phone"|"laptop", вирішує лише яка обгортка/рамка рендериться, самі
 * пропси екрана (components/stepNumber/onBack/...) не залежать від
 * пристрою.
 */
function DeviceMockup({ device, components, componentNumbers, stepNumber, totalSteps, onBack, onNext, canGoBack, canGoNext, inModal, onClose }) {
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
  const mockupRef = useRef(null);
  const screenZoom = usePhoneScreenZoom(mockupRef, ".cp-zoom-wrap", !isLaptop);
  return (
    <div className={mockupClass} ref={mockupRef} style={screenZoom ? { "--cp-zoom": screenZoom } : undefined}>
      {/* Хрестик — ДИТИНА мокапа, а не модалки: лише так він стоїть біля
          самої рамки пристрою (мокап центрований і має власну ширину, тож
          кут модалки від нього за сотні пікселів). */}
      {onClose && (
        <button type="button" className="iconbtn admin-preview-modal-close" onClick={onClose} aria-label="Закрити прев'ю" title="Закрити">
          <XIcon />
        </button>
      )}
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
  // Компонент монтується лише коли прев'ю відкрите, тож лок безумовний.
  useBodyScrollLock(true);
  const mockupRef = useRef(null);
  const screenZoom = usePhoneScreenZoom(mockupRef, ".course-card", course.previewDevice !== "laptop");
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
    <div className="admin-preview-modal-overlay" onClick={closeOnBackdrop(onClose)}>
      <div className="admin-preview-modal">
        <div className="admin-preview-modal-body">
          {/* Тут зум стоїть на самій .course-card (її приносить CoursePlayer,
              власної обгортки-зума в нього нема) — перевірено, що zoom на
              абсолютно позиціонованій картці НЕ ламає ні її розмір, ні
              положення в рамці: відсотки inset резолвляться до зуму. */}
          <div
            ref={mockupRef}
            style={screenZoom ? { "--cp-zoom": screenZoom } : undefined}
            className={`${course.previewDevice === "laptop" ? "laptop-mockup" : "iphone-mockup"} iphone-mockup--modal adm-run-preview`}
          >
            {/* Хрестик усередині мокапа — біля самої рамки, не в куті екрана
                (те саме, що й у DeviceMockup вище). */}
            <button type="button" className="iconbtn admin-preview-modal-close" onClick={onClose} aria-label="Закрити прев'ю" title="Закрити">
              <XIcon />
            </button>
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
                moduleCooldowns={Object.fromEntries((course.modules || []).map((m) => [m.id, m.cooldownDays || 0]))}
              />
            )}
            {/* Та сама рамка пристрою, що й у докнутому мокапі (DeviceMockup) —
                без неї прев’ю виглядало голою білою карткою (2026-09-15). */}
            {course.previewDevice === "laptop" ? <LaptopFrame /> : <IPhoneFrame />}
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
  // Сторінка редактора під модалкою не скролиться, поки вона відкрита.
  useBodyScrollLock(modalOpen);

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
          <div className="admin-preview-modal-overlay" onClick={closeOnBackdrop(() => setModalOpen(false))}>
            <div className="admin-preview-modal">
              <div className="admin-preview-modal-body">
                <DeviceMockup device={previewDevice} inModal onClose={() => setModalOpen(false)} {...previewProps} />
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
  const Screen =
    component.type === "hotspot"
      ? HotspotScreen
      : component.type === "ordering"
        ? OrderingScreen
        : component.type === "matching"
          ? MatchingScreen
          : QuizScreen;
  // key по вмісту — щоб перемішування варіантів/кроків перерахувалось,
  // коли автор правит список: інакше прев'ю показувало б старий порядок.
  return (
    <Screen
      key={JSON.stringify(component.content)}
      component={component}
      screenNumber={screenNumber}
      answer={answer}
      onAnswer={setAnswer}
    />
  );
}

/** Список компонентів екрана з перетягуванням (та сама механіка, що й
 * модулі, — див. ModuleHeader/handleModuleDrop) — ручка на кожному рядку,
 * порядок зберігається одразу через PATCH /api/admin/components/:id. */
function ComponentNavList({ components, selectedComponentId, onSelect, onReordered, questionStats = {} }) {
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
            <span className="admin-lesson-nav-type">
              {COMPONENT_TYPE_LABELS[component.type] || component.type}
              {/* Частка правильних по цьому питанню — «легке/складне»
                  видно одразу в списку, без переходу в саме питання. */}
              {questionStats[component.id] ? (
                <b className={questionStats[component.id].pct < 50 ? "admin-q-stat is-hard" : "admin-q-stat"}>
                  {questionStats[component.id].pct}%
                </b>
              ) : null}
            </span>
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
  const [questionPoolSize, setQuestionPoolSize] = useState(courseModule.questionPoolSize ?? "");
  const [retryFreeAttempts, setRetryFreeAttempts] = useState(courseModule.retryFreeAttempts ?? "");
  const [retryCooldownHours, setRetryCooldownHours] = useState(courseModule.retryCooldownHours ?? "");
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

  /** Числові поля модуля зберігаються однаково: порожньо = null (успадкувати
   *  або «без обмежень»), інакше число; без змін — запиту немає. */
  function numericBlur(field, raw) {
    return () => {
      const value = raw === "" ? null : Number(raw);
      if (value === (courseModule[field] ?? null)) return;
      save({ [field]: value });
    };
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
      {/* Пул питань і перевизначення правил перескладання — тут, поруч із
          паузами, а не в налаштуваннях курсу: це властивості КОНКРЕТНОГО
          модуля, і автор задає їх, коли вже бачить, скільки в модулі
          питань і наскільки він складний. Пояснення — на «ⓘ», бо в один
          рядок ці правила не вміщаються. */}
      {expanded && (
        <label className="admin-module-unlock" onClick={(e) => e.stopPropagation()}>
          Питань за спробу
          <input
            type="number"
            min="0"
            value={questionPoolSize}
            onChange={(e) => setQuestionPoolSize(e.target.value)}
            onBlur={numericBlur("questionPoolSize", questionPoolSize)}
            placeholder="усі"
            className="admin-num-wide"
          />
          <HintDot
            align="end"
            text="Скільки питань модуля показувати за одну спробу — випадкові з усіх, що є. Саме це ламає перебір варіантів при перескладанні: з другого разу питання інші, а знання те саме. Порожньо або число, не менше за кількість питань — показуються всі. Вибірка робиться на сервері, тож підглянути решту в коді сторінки не вийде."
          />
        </label>
      )}
      {expanded && (
        <label className="admin-module-unlock" onClick={(e) => e.stopPropagation()}>
          Спроб без паузи
          <input
            type="number"
            min="0"
            value={retryFreeAttempts}
            onChange={(e) => setRetryFreeAttempts(e.target.value)}
            onBlur={numericBlur("retryFreeAttempts", retryFreeAttempts)}
            placeholder="з курсу"
            className="admin-num-wide"
          />
          <HintDot
            align="end"
            text="Перевизначає правило курсу для ЦЬОГО модуля: скільки разів підряд можна перескласти його без паузи, якщо не склали. Порожньо — береться значення з налаштувань курсу («Перескладання»). Нуль — пауза діє одразу після першої невдалої спроби."
          />
        </label>
      )}
      {expanded && (
        <label className="admin-module-unlock" onClick={(e) => e.stopPropagation()}>
          Пауза, годин
          <input
            type="number"
            min="0"
            value={retryCooldownHours}
            onChange={(e) => setRetryCooldownHours(e.target.value)}
            onBlur={numericBlur("retryCooldownHours", retryCooldownHours)}
            placeholder="з курсу"
            className="admin-num-wide"
          />
          <HintDot
            align="end"
            text="Скільки годин чекати після вичерпання вільних спроб саме в цьому модулі. Порожньо — береться значення з налаштувань курсу. Нуль — паузи немає, скільки б спроб не було."
          />
        </label>
      )}
      {saving && <span className="admin-hint">збереження…</span>}
      <button type="button" onClick={handleDelete} className="admin-icon-btn" aria-label="Видалити модуль" title="Видалити цей модуль і весь його вміст">
        ✕
      </button>
    </div>
  );
}

function ScreenHeader({ screen, expanded, onToggleExpand, summary, onDelete, index, total, onMove, onRename }) {
  // Перейменування — прямо в рядку, як у модуля (ModuleHeader): окрема
  // форма чи діалог заради одного поля були б важчі за саму дію.
  // Олівець, а не «клік по назві»: сам рядок уже клікабельний і розгортає
  // екран, тож без явної кнопки перейменування конфліктувало б із ним.
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(screen.title);
  const inputRef = useRef(null);

  // Синхронізувати title з пропсом ефектом НЕ можна (правило React
  // Compiler: setState усередині ефекту тягне каскад рендерів) — та й не
  // треба: поле наповнюється в мить входу в режим, а поза ним його
  // значення нікому не потрібне.
  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function startRenaming() {
    setTitle(screen.title);
    setRenaming(true);
  }

  function commit() {
    setRenaming(false);
    const next = title.trim();
    // Порожня назва — не зберігаємо: екран лишився б безіменним рядком у
    // навігації, знайти його потім було б нічим.
    if (!next || next === screen.title) {
      setTitle(screen.title);
      return;
    }
    onRename?.(next);
  }

  // Рядок і розгортається по кліку, і тягнеться (lib/useDragReorder.ts).
  // Хук рух відстежує, але клік НЕ гасить — його теперішнім користувачам
  // (кроки «порядку») це не було потрібно, там onClick немає взагалі. Тут
  // потрібно: без цієї перевірки екран після кожного перетягування ще й
  // розгортався б. 4px — той самий поріг, що й у хука (CLICK_SLOP_PX).
  const pressYRef = useRef(null);

  return (
    <div
      className="admin-accordion-header admin-accordion-header-sub"
      onPointerDown={(e) => {
        pressYRef.current = e.clientY;
      }}
      onClick={(e) => {
        const pressedAt = pressYRef.current;
        pressYRef.current = null;
        if (pressedAt !== null && Math.abs(e.clientY - pressedAt) > 4) return;
        onToggleExpand();
      }}
    >
      {/* Тягнути екран можна ЛИШЕ за цю ручку або стрілками (рішення
          користувача 2026-09-23, після спроби зробити всю картку
          хапалкою): решта рядка — звичайні клікабельні елементи, і
          передусім шеврон, який розгортає екран. Коли драг стартував із
          будь-якої точки, шеврон переставав спрацьовувати — картка просто
          сіпалась під пальцем. */}
      <button
        type="button"
        className="admin-drag-handle"
        data-drag-handle
        title="Перетягніть, щоб змінити порядок екранів"
        aria-label={`Перетягніть екран «${screen.title}» — або керуйте стрілками нижче`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripIcon />
      </button>
      <span className={`admin-accordion-caret${expanded ? " open" : ""}`}>
        <ChevronIcon />
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setTitle(screen.title);
              setRenaming(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="admin-input-flex admin-title-input"
          aria-label="Назва екрана"
        />
      ) : (
        <h3>{screen.title}</h3>
      )}
      {!renaming && (
        <button
          type="button"
          className="admin-icon-btn admin-icon-btn--edit"
          onClick={(e) => {
            e.stopPropagation();
            startRenaming();
          }}
          aria-label="Перейменувати екран"
          title="Перейменувати екран"
        >
          <PencilIcon />
        </button>
      )}
      <span className="admin-hint admin-accordion-summary">{summary}</span>
      {/* Стрілки — не дубль перетягування, а єдиний спосіб змінити порядок
          там, де HTML5-drag не працює взагалі: планшет, телефон, клавіатура.
          Ті самі стрілки, що в «порядку кроків» у плеєра. */}
      {onMove && (
        <span className="admin-accordion-moves">
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn--move"
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
            disabled={index === 0}
            aria-label="Підняти екран"
            title="Підняти екран вище"
          >
            {/* SVG, а не гліф «↑»: текстова стрілка сидить у рядку вище
                оптичного центру, і в кружку кнопки виглядала зсунутою —
                паддингом це не лікується, бо залежить від метрики шрифту. */}
            <span className="admin-move-ico is-up" aria-hidden="true">
              <ChevronIcon />
            </span>
          </button>
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn--move"
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
            disabled={index === total - 1}
            aria-label="Опустити екран"
            title="Опустити екран нижче"
          >
            <span className="admin-move-ico is-down" aria-hidden="true">
              <ChevronIcon />
            </span>
          </button>
        </span>
      )}
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

/**
 * Список екранів модуля з перетягуванням. Окремий компонент, а не шматок
 * JSX усередині map — інакше useDragReorder довелось би викликати в циклі,
 * що заборонено правилами хуків: кожен модуль має власний список і власний
 * стан перетягування.
 *
 * Механіка — той самий lib/useDragReorder.ts, що вже тягає кроки «порядку»
 * в конструкторі й у плеєрі: pointer events (працює і пальцем, на відміну
 * від HTML5-drag), FLIP-доїзд сусідів, стрілки з клавіатури на ручці.
 * Другого механізму перетягування в цьому файлі свідомо не заводимо.
 */
function ModuleScreens({
  courseModule,
  expandedScreenId,
  onToggleScreen,
  onDeleteScreen,
  onRenameScreen,
  onReorder,
  questionStats,
  selectedComponentId,
  onSelectComponent,
  onComponentsReordered,
  onComponentCreated,
}) {
  const screens = courseModule.screens;
  // Ідентичність рядка — screen.id, а НЕ сам об'єкт екрана.
  //
  // Кроки «порядку» вище передають у хук самі об'єкти, і їм це можна:
  // їхній setItem лишає референси незмінними. Тут інакше — збереження
  // порядку проставляє кожному екрану новий order, тобто створює НОВІ
  // об'єкти. Після першої ж перестановки взятий рядок переставав
  // знаходитись у списку за старою ссилкою, і перетягування вмирало,
  // зсунувши екран рівно на одну позицію — як стрілка (скарга
  // користувача 2026-09-23). Число переживає будь-яке перестворення.
  // useMemo не про швидкодію: FLIP-ефект хука висить на `ids`, і новий
  // масив на кожному рендері ганяв би його дарма. Тут масив міняється
  // рівно тоді, коли справді змінився порядок, — саме коли й треба
  // «доїхати» рядкам.
  const screenIds = useMemo(() => screens.map((s) => s.id), [screens]);
  const { containerRef, containerProps, registerRow, dragId, dragDeltaY, moveByKeyboard } = useDragReorder({
    ids: screenIds,
    onReorder: (nextIds) => {
      const byId = new Map(screens.map((s) => [s.id, s]));
      onReorder(nextIds.map((id) => byId.get(id)).filter(Boolean));
    },
  });

  return (
    // Клас на обгортці обов'язковий: щільний список екранів із
    // роздільниками тримається саме на ньому. Доти правило було
    // прив'язане до .admin-accordion-body, і поява цієї обгортки розірвала
    // селектор — між екранами знову з'явилось по 32px порожнечі
    // (скарга користувача 2026-09-23).
    <div ref={containerRef} {...containerProps} className="admin-screen-list">
      {screens.map((screen, screenIndex) => {
        const isScreenExpanded = expandedScreenId === screen.id;
        return (
          <section
            key={screen.id}
            ref={registerRow(screen.id)}
            data-drag-row
            className={`admin-module admin-drag-row${dragId === screen.id ? " is-dragging" : ""}`}
            style={dragId === screen.id ? { transform: `translateY(${dragDeltaY}px)` } : undefined}
            // Драг стартує ТІЛЬКИ з ручки: хук слухає контейнер, тож
            // зупиняємо подію на рядку раніше, ніж вона туди дійде. Так
            // сам хук (спільний з іншими списками) лишається незмінним, а
            // шеврон, заголовок і стрілки поводяться як звичайні кнопки.
            onPointerDown={(e) => {
              if (!e.target.closest?.("[data-drag-handle]")) e.stopPropagation();
            }}
          >
            <ScreenHeader
              screen={screen}
              expanded={isScreenExpanded}
              onToggleExpand={() => onToggleScreen(screen.id)}
              summary={`${screen.components.length} комп.`}
              onDelete={() => onDeleteScreen(screen)}
              onRename={(title) => onRenameScreen(screen, title)}
              index={screenIndex}
              total={screens.length}
              onMove={(dir) => moveByKeyboard(screen.id, dir)}
            />

            {isScreenExpanded && (
              <div className="admin-accordion-body">
                <ComponentNavList
                  questionStats={questionStats}
                  components={screen.components}
                  selectedComponentId={selectedComponentId}
                  onSelect={(componentId) => onSelectComponent(screen.id, componentId)}
                  onReordered={(reordered) => onComponentsReordered(screen.id, reordered)}
                />
                <NewComponentForm
                  screenId={screen.id}
                  nextOrder={screen.components.length + 1}
                  onCreated={(created) => onComponentCreated(screen.id, created)}
                />
              </div>
            )}
          </section>
        );
      })}
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
  // Частка правильних по кожному питанню курсу — вантажиться один раз і
  // далі лише показується біля питань (аналітика складності, 2026-09-17).
  const [questionStats, setQuestionStats] = useState({});
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/courses/${courseId}/question-stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // Статистика — довідкова: її відсутність не має ламати редактор.
        if (!cancelled && data?.stats) setQuestionStats(data.stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId]);
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
  /**
   * Перестановка ЕКРАНІВ усередині модуля — і перетягуванням, і стрілками.
   *
   * Обов'язково переписуємо order УСІМ екранам модуля (1..N), а не міняємо
   * місцями два значення: при однакових order база вертає екрани в
   * довільному порядку, і курс у плеєрі почав би «плавати» між
   * завантаженнями. Та сама причина, чому так зроблено для компонентів
   * (ComponentNavList) і модулів (handleModuleDrop нижче).
   *
   * Наскрізна нумерація питань нічого окремого не потребує: і конструктор
   * (numberComponents), і плеєр (quizComponentIds.indexOf) рахують номер
   * від ПОРЯДКУ в списку, а не зберігають його. Щойно масив перебудовано —
   * номери вже правильні.
   */
  /**
   * Перейменування екрана. Стан оновлюємо ОДРАЗУ, не чекаючи сервера:
   * назва бере участь у навігації, хлібних крихтах і прев'ю, і бачити
   * стару ще пів секунди після Enter — гірше, ніж зрідка відкотити її
   * назад, якщо запит не пройшов.
   */
  function renameScreen(moduleId, screenId, title) {
    const setTitle = (value) =>
      setCourse((c) => ({
        ...c,
        modules: c.modules.map((m) =>
          m.id === moduleId ? { ...m, screens: m.screens.map((s) => (s.id === screenId ? { ...s, title: value } : s)) } : m
        ),
      }));
    const previous = course.modules.find((m) => m.id === moduleId)?.screens.find((s) => s.id === screenId)?.title;
    setTitle(title);
    fetch(`/api/admin/screens/${screenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("rename failed");
      })
      .catch(() => {
        if (previous !== undefined) setTitle(previous);
      });
  }

  function persistScreenOrder(moduleId, nextScreens) {
    const withOrder = nextScreens.map((s, i) => ({ ...s, order: i + 1 }));
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => (m.id === moduleId ? { ...m, screens: withOrder } : m)),
    }));
    Promise.all(
      withOrder.map((screen, i) =>
        fetch(`/api/admin/screens/${screen.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i + 1 }),
        })
      )
    );
  }

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
                    <ModuleScreens
                      courseModule={courseModule}
                      expandedScreenId={expandedScreenId}
                      onToggleScreen={(screenId) => setExpandedScreenId(expandedScreenId === screenId ? null : screenId)}
                      onDeleteScreen={(screen) => handleDeleteScreen(courseModule.id, screen.id, screen.title)}
                      onRenameScreen={(screen, title) => renameScreen(courseModule.id, screen.id, title)}
                      onReorder={(next) => persistScreenOrder(courseModule.id, next)}
                      questionStats={questionStats}
                      selectedComponentId={selectedComponentId}
                      onSelectComponent={(screenId, componentId) => selectComponent(courseModule.id, screenId, componentId)}
                      onComponentsReordered={reorderComponentsInState}
                      onComponentCreated={addComponentToState}
                    />

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
