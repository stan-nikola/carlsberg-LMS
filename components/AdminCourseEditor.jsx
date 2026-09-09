"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { InfoScreen, QuizScreen } from "@/components/CoursePlayer";
import { ChevronIcon, GripIcon } from "@/components/icons";

// Десктопний редактор контенту курсу.
//
// Зліва — акордеон Блок -> Модуль -> Екран (кожен рівень згортається,
// щоб було видно структуру, а не суцільний список однаково виглядних
// заголовків) + форма правки ОДНОГО обраного екрану з кнопками "Далі"/
// "Назад" — так само, як співробітник проходить курс по кроках, а не
// довгою стрічкою всіх екранів одразу.
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

/** "3 модулі" / "1 екран" / "5 екранів" — українська форма множини для
 * коротких підписів у згорнутому акордеоні (BlockHeader/ModuleHeader). */
function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? few : many;
  return `${n} ${word}`;
}

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
        <button type="button" className="admin-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Завантаження…" : "Обрати фото…"}
        </button>
        <input
          placeholder="або встав URL /assets/…"
          value={image.url}
          onChange={(e) => onChange({ ...image, url: e.target.value })}
          className="admin-input-flex admin-input-mono"
        />
        <button type="button" onClick={onRemove} className="admin-icon-btn" aria-label="Видалити зображення">
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
      <button type="button" onClick={addImage} className="admin-btn-link">
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
          <button type="button" onClick={() => removeOption(i)} className="admin-icon-btn" aria-label="Видалити варіант">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={addOption} className="admin-btn-link">
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

/** Тільки поля форми правки (без грід-обгортки) — рендериться в лівій
 * колонці спільного admin-editor-grid разом з навігацією по екранах. */
function LessonEditForm({ lesson, onSaved, onDeleted, onLiveChange }) {
  const [title, setTitle] = useState(lesson.title);
  const [type, setType] = useState(lesson.type);
  const [content, setContent] = useState(lesson.content);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  // Батько рендерить <LessonEditForm key={lesson.id} .../> — зміна
  // lesson.id вже сама по собі перемонтовує форму (useState підхопить
  // нові initial values). Цей ефект — для іншого випадку: той самий
  // lesson.id, але вміст оновився ЗЗОВНІ (сервер повернув нормалізовані
  // дані після handleSave) — синхронізуємо форму з тим, що реально
  // зберіглося.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(lesson.title);
    setType(lesson.type);
    setContent(lesson.content);
    setError("");
    setImageUploading(false);
  }, [lesson.id, lesson.title, lesson.type, lesson.content]);

  // Прокидаємо поточний стан форми нагору для живої прев'ю в правій колонці.
  useEffect(() => {
    onLiveChange({ id: lesson.id, title, type, content });
  }, [lesson.id, title, type, content, onLiveChange]);

  function handleTypeChange(newType) {
    setType(newType);
    setContent(emptyContent[newType]);
  }

  async function handleSave() {
    // Фото ще вантажиться (в тому ж content.images) — url на цю мить
    // порожній, зберегти зараз означало б записати екран без фото.
    if (imageUploading) {
      setError("Зачекайте, поки фото завантажиться, і збережіть ще раз.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, content }),
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
    if (!confirm(`Видалити екран «${lesson.title}»?`)) return;
    const res = await fetch(`/api/admin/lessons/${lesson.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(lesson.id);
  }

  return (
    <div className="admin-lesson-card">
      <div className="admin-row">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex admin-title-input" />
        <select value={type} onChange={(e) => handleTypeChange(e.target.value)} className="admin-select">
          <option value="info">інфо-екран</option>
          <option value="quiz">питання</option>
        </select>
      </div>

      {type === "quiz" ? (
        <QuizFields content={content} onChange={setContent} radioGroupName={`qtype-${lesson.id}`} />
      ) : (
        <InfoFields content={content} onChange={setContent} onUploadingChange={setImageUploading} />
      )}

      {error && <p className="admin-error">{error}</p>}
      <div className="admin-row">
        <button type="button" onClick={handleSave} disabled={saving || imageUploading} className="admin-btn">
          {imageUploading ? "Зачекайте, фото вантажиться…" : saving ? "Збереження…" : "Зберегти"}
        </button>
        <button type="button" onClick={handleDelete} className="admin-btn admin-btn-danger">
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
function LessonPreview({ lesson, stepNumber, totalSteps, onBack, onNext, canGoBack, canGoNext }) {
  return (
    <div className="admin-editor-preview">
      <div className="stage">
        <div className="course-card">
          <div className="appbar">
            <button type="button" className="iconbtn" onClick={onBack} disabled={!canGoBack} aria-label="Назад">
              <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
                <ChevronIcon />
              </span>
            </button>
            <div style={{ flex: 1 }} />
            {lesson && (
              <span className="cp-step-count">
                {stepNumber}/{totalSteps}
              </span>
            )}
          </div>
          {lesson && (
            <div className="cp-progress-track">
              <div className="cp-progress-fill" style={{ width: `${Math.round((stepNumber / totalSteps) * 100)}%` }} />
            </div>
          )}

          <div className="cp-viewport">
            {!lesson ? (
              <p className="admin-preview-empty">Оберіть екран зліва, щоб побачити прев&apos;ю.</p>
            ) : lesson.type === "quiz" ? (
              <PreviewQuiz lesson={lesson} />
            ) : (
              <InfoScreen lesson={lesson} screenNumber={stepNumber} />
            )}
          </div>

          {lesson && (
            <div className="navwrap">
              <div className="navbar">
                <button type="button" className="btn btn-ghost" onClick={onBack} style={{ visibility: canGoBack ? "visible" : "hidden" }}>
                  Назад
                </button>
                <button type="button" className="btn btn-primary" onClick={onNext} disabled={!canGoNext}>
                  Далі
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Обгортка над QuizScreen з власним локальним станом відповіді — щоб
 * прев'ю в /admin можна було "клікнути" так само, як побачить співробітник,
 * не чіпаючи реальний Enrollment. */
function PreviewQuiz({ lesson }) {
  const [answer, setAnswer] = useState(undefined);
  // Скидаємо відповідь у прев'ю щоразу, як екран/його вміст змінюється —
  // ефект, а не похідний стан, бо триґериться і зі стабільним lesson.id
  // (правки контенту вживу), не тільки при зміні обраного екрана.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setAnswer(undefined), [lesson.id, lesson.content]);
  return <QuizScreen lesson={lesson} screenNumber={1} answer={answer} onAnswer={setAnswer} />;
}

/** Список екранів модуля з перетягуванням (та сама механіка, що й
 * блоки, — див. BlockHeader/handleBlockDrop) — ручка на кожному рядку,
 * порядок зберігається одразу через PATCH /api/admin/lessons/:id. */
function LessonNavList({ lessons, selectedLessonId, onSelect, onReordered }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  function handleDrop(targetIndex) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...lessons];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((l, i) => ({ ...l, order: i + 1 }));
    onReordered(withOrder);
    Promise.all(
      withOrder.map((lesson, i) =>
        fetch(`/api/admin/lessons/${lesson.id}`, {
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
      {lessons.map((lesson, i) => (
        <div
          key={lesson.id}
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
            className={`admin-lesson-nav-item${lesson.id === selectedLessonId ? " active" : ""}`}
            onClick={() => onSelect(lesson.id)}
          >
            <span>{lesson.title}</span>
            <span className="admin-lesson-nav-type">{lesson.type === "quiz" ? "питання" : "інфо"}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function NewLessonForm({ moduleId, nextOrder, onCreated }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("info");

  async function handleCreate() {
    if (!title.trim()) return;
    const res = await fetch("/api/admin/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId, title, type, order: nextOrder, content: emptyContent[type] }),
    });
    if (res.ok) {
      setTitle("");
      onCreated(await res.json());
    }
  }

  return (
    <div className="admin-row admin-new-lesson">
      <input placeholder="Назва нового екрану" value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" />
      <select value={type} onChange={(e) => setType(e.target.value)} className="admin-select">
        <option value="info">інфо-екран</option>
        <option value="quiz">питання</option>
      </select>
      <button type="button" onClick={handleCreate} className="admin-btn">
        + Додати екран
      </button>
    </div>
  );
}

function NewModuleForm({ blockId, nextOrder, onCreated }) {
  const [title, setTitle] = useState("");

  async function handleCreate() {
    if (!title.trim()) return;
    const res = await fetch("/api/admin/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId, title, order: nextOrder }),
    });
    if (res.ok) {
      setTitle("");
      onCreated(await res.json());
    }
  }

  return (
    <div className="admin-row admin-new-lesson">
      <input placeholder="Назва нового модуля" value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" />
      <button type="button" onClick={handleCreate} className="admin-btn-link">
        + Додати модуль
      </button>
    </div>
  );
}

function NewBlockForm({ courseId, nextOrder, onCreated }) {
  const [title, setTitle] = useState("");

  async function handleCreate() {
    if (!title.trim()) return;
    const res = await fetch("/api/admin/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, title, order: nextOrder }),
    });
    if (res.ok) {
      setTitle("");
      onCreated(await res.json());
    }
  }

  return (
    <div className="admin-row admin-new-lesson">
      <input placeholder="Назва нового блоку" value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex admin-title-input" />
      <button type="button" onClick={handleCreate} className="admin-btn">
        + Додати блок
      </button>
    </div>
  );
}

function BlockHeader({ block, expanded, onToggleExpand, summary, onSaved, onDeleted, dragHandleProps }) {
  const [title, setTitle] = useState(block.title);
  const [cooldownDays, setCooldownDays] = useState(block.cooldownDays ?? "");
  const [saving, setSaving] = useState(false);

  async function save(patch) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/blocks/${block.id}`, {
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
    if (title === block.title || !title.trim()) return;
    save({ title });
  }

  function handleCooldownBlur() {
    const value = cooldownDays === "" ? null : Number(cooldownDays);
    if (value === (block.cooldownDays ?? null)) return;
    save({ cooldownDays: value });
  }

  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Видалити блок «${block.title}» разом з усіма його модулями й екранами?`)) return;
    const res = await fetch(`/api/admin/blocks/${block.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(block.id);
  }

  return (
    <div className="admin-accordion-header" onClick={onToggleExpand}>
      <span
        className="admin-drag-handle"
        title="Перетягніть, щоб змінити порядок блоків"
        onClick={(e) => e.stopPropagation()}
        {...dragHandleProps}
      >
        <GripIcon />
      </span>
      <span className="admin-accordion-caret">{expanded ? "▾" : "▸"}</span>
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
          title="Скільки днів має минути з моменту, як співробітник склав ПОПЕРЕДНІЙ блок, перш ніж відкриється цей"
        >
          Пауза між блоками
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
      {saving && <span className="admin-hint">збереження…</span>}
      <button type="button" onClick={handleDelete} className="admin-icon-btn" aria-label="Видалити блок">
        ✕
      </button>
    </div>
  );
}

function ModuleHeader({ courseModule, expanded, onToggleExpand, summary, onSaved, onDelete }) {
  return (
    <div className="admin-accordion-header admin-accordion-header-sub" onClick={onToggleExpand}>
      <span className="admin-accordion-caret">{expanded ? "▾" : "▸"}</span>
      <h3>{courseModule.title}</h3>
      {!expanded && <span className="admin-hint admin-accordion-summary">{summary}</span>}
      {expanded && (
        <span onClick={(e) => e.stopPropagation()}>
          <ModuleUnlockField courseModule={courseModule} onSaved={onSaved} />
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="admin-icon-btn"
        aria-label="Видалити модуль"
      >
        ✕
      </button>
    </div>
  );
}

function ModuleUnlockField({ courseModule, onSaved }) {
  const [days, setDays] = useState(courseModule.unlockAfterDays ?? "");
  const [saving, setSaving] = useState(false);

  async function handleBlurSave() {
    const value = days === "" ? null : Number(days);
    if (value === (courseModule.unlockAfterDays ?? null)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/modules/${courseModule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockAfterDays: value }),
      });
      if (res.ok) onSaved(await res.json());
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="admin-module-unlock">
      Відкриття через
      <input
        type="number"
        min="0"
        value={days}
        onChange={(e) => setDays(e.target.value)}
        onBlur={handleBlurSave}
        placeholder="0"
      />
      {saving ? "збереження…" : "дн. після призначення курсу"}
    </label>
  );
}

export function AdminCourseEditor({ courseId }) {
  // Перехід з дашборду /admin по конкретному блоку (?block=ID) — одразу
  // відкриває перший екран цього блоку для правки, а не перший екран
  // першого блоку курсу.
  const searchParams = useSearchParams();
  const focusedBlockId = Number(searchParams.get("block")) || null;

  const [course, setCourse] = useState(null);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [expandedBlockId, setExpandedBlockId] = useState(null);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [livePreviewLesson, setLivePreviewLesson] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [dragBlockIndex, setDragBlockIndex] = useState(null);
  const [overBlockIndex, setOverBlockIndex] = useState(null);

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
        const focusedBlock = courseData.blocks.find((b) => b.id === focusedBlockId);
        const startBlock = focusedBlock || courseData.blocks[0];
        const startModule = startBlock?.modules[0];
        const firstLesson = startModule?.lessons[0];
        if (firstLesson) {
          setSelectedLessonId(firstLesson.id);
          setExpandedBlockId(startBlock.id);
          setExpandedModuleId(startModule.id);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // Блок -> Модуль -> Екран (див. schema.prisma) — всі оновлення стану
  // йдуть через мапу по blocks, знаходячи потрібний блок/модуль за id.
  function updateLessonInState(moduleId, updated) {
    setCourse((c) => ({
      ...c,
      blocks: c.blocks.map((b) => ({
        ...b,
        modules: b.modules.map((m) =>
          m.id === moduleId ? { ...m, lessons: m.lessons.map((l) => (l.id === updated.id ? updated : l)) } : m
        ),
      })),
    }));
  }

  function removeLessonFromState(moduleId, lessonId) {
    setCourse((c) => ({
      ...c,
      blocks: c.blocks.map((b) => ({
        ...b,
        modules: b.modules.map((m) =>
          m.id === moduleId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) } : m
        ),
      })),
    }));
    if (selectedLessonId === lessonId) setSelectedLessonId(null);
  }

  function addLessonToState(moduleId, created) {
    setCourse((c) => ({
      ...c,
      blocks: c.blocks.map((b) => ({
        ...b,
        modules: b.modules.map((m) => (m.id === moduleId ? { ...m, lessons: [...m.lessons, created] } : m)),
      })),
    }));
    setSelectedLessonId(created.id);
  }

  function reorderLessonsInState(moduleId, reorderedLessons) {
    setCourse((c) => ({
      ...c,
      blocks: c.blocks.map((b) => ({
        ...b,
        modules: b.modules.map((m) => (m.id === moduleId ? { ...m, lessons: reorderedLessons } : m)),
      })),
    }));
  }

  function updateModuleInState(updated) {
    setCourse((c) => ({
      ...c,
      blocks: c.blocks.map((b) => ({
        ...b,
        modules: b.modules.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
      })),
    }));
  }

  function addModuleToState(blockId, created) {
    setCourse((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, modules: [...b.modules, created] } : b)),
    }));
  }

  function removeModuleFromState(blockId, moduleId) {
    setCourse((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, modules: b.modules.filter((m) => m.id !== moduleId) } : b)),
    }));
    if (selectedModule?.id === moduleId) setSelectedLessonId(null);
  }

  async function handleDeleteModule(blockId, moduleId, moduleTitle) {
    if (!confirm(`Видалити модуль «${moduleTitle}» разом з усіма його екранами?`)) return;
    const res = await fetch(`/api/admin/modules/${moduleId}`, { method: "DELETE" });
    if (res.ok) removeModuleFromState(blockId, moduleId);
  }

  function updateBlockInState(updated) {
    setCourse((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)) }));
  }

  function removeBlockFromState(blockId) {
    setCourse((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== blockId) }));
  }

  function addBlockToState(created) {
    setCourse((c) => ({ ...c, blocks: [...c.blocks, created] }));
  }

  // Drag-and-drop блоків прямо в редакторі (не лише на дашборді) —
  // оптимістичне оновлення порядку локально + збереження order (1..N)
  // кожного блоку через PATCH.
  function handleBlockDrop(targetIndex) {
    if (dragBlockIndex === null || dragBlockIndex === targetIndex) {
      setDragBlockIndex(null);
      setOverBlockIndex(null);
      return;
    }
    const reordered = [...course.blocks];
    const [moved] = reordered.splice(dragBlockIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((b, i) => ({ ...b, order: i + 1 }));
    setCourse((c) => ({ ...c, blocks: withOrder }));
    Promise.all(
      withOrder.map((block, i) =>
        fetch(`/api/admin/blocks/${block.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i + 1 }),
        })
      )
    );
    setDragBlockIndex(null);
    setOverBlockIndex(null);
  }

  if (loadError) return <p className="admin-page admin-error">Не вдалося завантажити курс: {loadError}</p>;
  if (!course) return <p className="admin-page">Завантаження…</p>;

  const allModules = course.blocks.flatMap((b) => b.modules);
  const selectedLesson = allModules.flatMap((m) => m.lessons).find((l) => l.id === selectedLessonId);
  const selectedModule = allModules.find((m) => m.lessons.some((l) => l.id === selectedLessonId));
  const selectedBlock = course.blocks.find((b) => b.modules.some((m) => m.id === selectedModule?.id));

  // Плаский список УСІХ екранів курсу в порядку проходження — для
  // "Далі"/"Назад" (та сама послідовність, що бачить співробітник у
  // CoursePlayer) і лічильника "Екран N з M".
  const flatLessons = course.blocks.flatMap((block) =>
    block.modules.flatMap((mod) => mod.lessons.map((lesson) => ({ lesson, block, module: mod })))
  );
  const currentIndex = flatLessons.findIndex((f) => f.lesson.id === selectedLessonId);

  function selectLesson(blockId, moduleId, lessonId) {
    setSelectedLessonId(lessonId);
    setExpandedBlockId(blockId);
    setExpandedModuleId(moduleId);
  }

  function goToOffset(offset) {
    const target = flatLessons[currentIndex + offset];
    if (target) selectLesson(target.block.id, target.module.id, target.lesson.id);
  }

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
          {course.blocks.map((block, blockIndex) => {
            const isBlockExpanded = expandedBlockId === block.id;
            const blockLessonCount = block.modules.reduce((n, m) => n + m.lessons.length, 0);
            return (
              <section
                key={block.id}
                className={`admin-block${overBlockIndex === blockIndex && dragBlockIndex !== null && dragBlockIndex !== blockIndex ? " admin-drag-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverBlockIndex(blockIndex);
                }}
                onDragLeave={() => setOverBlockIndex((v) => (v === blockIndex ? null : v))}
                onDrop={() => handleBlockDrop(blockIndex)}
              >
                <BlockHeader
                  block={block}
                  expanded={isBlockExpanded}
                  onToggleExpand={() => setExpandedBlockId(isBlockExpanded ? null : block.id)}
                  summary={`${pluralize(block.modules.length, "модуль", "модулі", "модулів")} · ${pluralize(blockLessonCount, "екран", "екрани", "екранів")}`}
                  onSaved={updateBlockInState}
                  onDeleted={removeBlockFromState}
                  dragHandleProps={{
                    draggable: true,
                    onDragStart: () => setDragBlockIndex(blockIndex),
                    onDragEnd: () => {
                      setDragBlockIndex(null);
                      setOverBlockIndex(null);
                    },
                  }}
                />

                {isBlockExpanded && (
                  <div className="admin-accordion-body">
                    {block.modules.map((courseModule) => {
                      const isModuleExpanded = expandedModuleId === courseModule.id;
                      return (
                        <section key={courseModule.id} className="admin-module">
                          <ModuleHeader
                            courseModule={courseModule}
                            expanded={isModuleExpanded}
                            onToggleExpand={() => setExpandedModuleId(isModuleExpanded ? null : courseModule.id)}
                            summary={pluralize(courseModule.lessons.length, "екран", "екрани", "екранів")}
                            onSaved={updateModuleInState}
                            onDelete={() => handleDeleteModule(block.id, courseModule.id, courseModule.title)}
                          />

                          {isModuleExpanded && (
                            <div className="admin-accordion-body">
                              <LessonNavList
                                lessons={courseModule.lessons}
                                selectedLessonId={selectedLessonId}
                                onSelect={(lessonId) => selectLesson(block.id, courseModule.id, lessonId)}
                                onReordered={(reordered) => reorderLessonsInState(courseModule.id, reordered)}
                              />
                              <NewLessonForm
                                moduleId={courseModule.id}
                                nextOrder={courseModule.lessons.length + 1}
                                onCreated={(created) => addLessonToState(courseModule.id, created)}
                              />
                            </div>
                          )}
                        </section>
                      );
                    })}

                    <NewModuleForm
                      blockId={block.id}
                      nextOrder={block.modules.length + 1}
                      onCreated={(created) => {
                        addModuleToState(block.id, created);
                        setExpandedModuleId(created.id);
                      }}
                    />
                  </div>
                )}
              </section>
            );
          })}

          <NewBlockForm
            courseId={course.id}
            nextOrder={course.blocks.length + 1}
            onCreated={(created) => {
              addBlockToState(created);
              setExpandedBlockId(created.id);
            }}
          />

          {selectedLesson && selectedModule && selectedBlock && (
            <div className="admin-lesson-editor-panel">
              <div className="admin-breadcrumb">
                <span>{selectedBlock.title}</span>
                <span className="admin-breadcrumb-sep">›</span>
                <span>{selectedModule.title}</span>
                <span className="admin-breadcrumb-sep">·</span>
                <span>
                  Екран {currentIndex + 1} з {flatLessons.length}
                </span>
              </div>
              <LessonEditForm
                key={selectedLesson.id}
                lesson={selectedLesson}
                onSaved={(updated) => updateLessonInState(selectedModule.id, updated)}
                onDeleted={(id) => removeLessonFromState(selectedModule.id, id)}
                onLiveChange={setLivePreviewLesson}
              />
              <div className="admin-row admin-lesson-step-nav">
                <button type="button" className="admin-btn-link" onClick={() => goToOffset(-1)} disabled={currentIndex <= 0}>
                  ← Попередній екран
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => goToOffset(1)}
                  disabled={currentIndex < 0 || currentIndex >= flatLessons.length - 1}
                >
                  Наступний екран →
                </button>
              </div>
            </div>
          )}
        </div>

        <LessonPreview
          lesson={livePreviewLesson}
          stepNumber={currentIndex + 1}
          totalSteps={flatLessons.length}
          onBack={() => goToOffset(-1)}
          onNext={() => goToOffset(1)}
          canGoBack={currentIndex > 0}
          canGoNext={currentIndex >= 0 && currentIndex < flatLessons.length - 1}
        />
      </div>
    </div>
  );
}
