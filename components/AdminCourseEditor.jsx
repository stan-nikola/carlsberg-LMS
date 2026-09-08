"use client";

import { useEffect, useState } from "react";

// Мінімальний, навмисно "чисто функціональний" (без брендового UI
// course-card) редактор контенту курсу. Поля структуровані під те, що
// реально бачить CoursePlayer (lib/courseContent.js) — kicker/lead/body/
// images/note для "info" і questionType/options для "quiz" — а не сирий
// JSON, щоб редагувати міг не тільки розробник.

const emptyContent = {
  info: { kicker: "", lead: "", body: "", note: "", images: [] },
  quiz: { questionType: "single", options: [] },
};

function ImageListEditor({ images, onChange }) {
  function updateImage(index, field, value) {
    const next = images.map((img, i) => (i === index ? { ...img, [field]: value } : img));
    onChange(next);
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
        <div className="admin-row admin-image-row" key={i}>
          <input
            placeholder="/assets/…"
            value={img.url}
            onChange={(e) => updateImage(i, "url", e.target.value)}
            className="admin-input-flex admin-input-mono"
          />
          <input
            placeholder="підпис (необов'язково)"
            value={img.caption}
            onChange={(e) => updateImage(i, "caption", e.target.value)}
            className="admin-input-flex"
          />
          <button type="button" onClick={() => removeImage(i)} className="admin-icon-btn" aria-label="Видалити зображення">
            ✕
          </button>
        </div>
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
            <input
              type="checkbox"
              checked={opt.correct}
              onChange={(e) => updateOption(i, "correct", e.target.checked)}
            />
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

function InfoFields({ content, onChange }) {
  const c = { ...emptyContent.info, ...content, images: content.images || [] };
  const set = (field) => (value) => onChange({ ...c, [field]: value });

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Рубрика (kicker)</label>
        <input
          value={c.kicker}
          onChange={(e) => set("kicker")(e.target.value)}
          placeholder="Наприклад: ПРО КОМПАНІЮ"
          className="admin-input-flex"
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Вступний рядок (lead)</label>
        <textarea
          value={c.lead}
          onChange={(e) => set("lead")(e.target.value)}
          rows={2}
          className="admin-textarea"
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Текст екрану <span className="admin-hint">— **так** для жирного, порожній рядок = новий абзац</span>
        </label>
        <textarea
          value={c.body}
          onChange={(e) => set("body")(e.target.value)}
          rows={5}
          className="admin-textarea"
        />
      </div>
      <ImageListEditor images={c.images} onChange={set("images")} />
      <div className="admin-field">
        <label className="admin-label">Підказка (завжди видима замітка)</label>
        <textarea
          value={c.note}
          onChange={(e) => set("note")(e.target.value)}
          rows={2}
          className="admin-textarea"
        />
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
            <input
              type="radio"
              name={radioGroupName}
              checked={c.questionType === "single"}
              onChange={() => set("questionType")("single")}
            />
            <span>одна правильна відповідь</span>
          </label>
          <label className="admin-radio">
            <input
              type="radio"
              name={radioGroupName}
              checked={c.questionType === "multi"}
              onChange={() => set("questionType")("multi")}
            />
            <span>декілька правильних</span>
          </label>
        </div>
      </div>
      <OptionListEditor options={c.options} onChange={set("options")} />
    </>
  );
}

function LessonEditor({ lesson, onSaved, onDeleted }) {
  const [title, setTitle] = useState(lesson.title);
  const [type, setType] = useState(lesson.type);
  const [content, setContent] = useState(lesson.content);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleTypeChange(newType) {
    setType(newType);
    setContent(emptyContent[newType]);
  }

  async function handleSave() {
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
        <InfoFields content={content} onChange={setContent} />
      )}

      {error && <p className="admin-error">{error}</p>}
      <div className="admin-row">
        <button type="button" onClick={handleSave} disabled={saving} className="admin-btn">
          {saving ? "Збереження…" : "Зберегти"}
        </button>
        <button type="button" onClick={handleDelete} className="admin-btn admin-btn-danger">
          Видалити
        </button>
      </div>
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
      <input
        placeholder="Назва нового екрану"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="admin-input-flex"
      />
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

export function AdminCourseEditor({ courseId }) {
  const [course, setCourse] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/courses/${courseId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setCourse(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  function updateLessonInState(moduleId, updated) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) =>
        m.id === moduleId
          ? { ...m, lessons: m.lessons.map((l) => (l.id === updated.id ? updated : l)) }
          : m
      ),
    }));
  }

  function removeLessonFromState(moduleId, lessonId) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) =>
        m.id === moduleId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) } : m
      ),
    }));
  }

  function addLessonToState(moduleId, created) {
    setCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => (m.id === moduleId ? { ...m, lessons: [...m.lessons, created] } : m)),
    }));
  }

  if (loadError) return <p className="admin-page admin-error">Не вдалося завантажити курс: {loadError}</p>;
  if (!course) return <p className="admin-page">Завантаження…</p>;

  return (
    <div className="admin-page">
      <h1>{course.title}</h1>
      <p className="admin-subtitle">
        {course.slug} · isMandatory: {String(course.isMandatory)}
      </p>

      {course.modules.map((courseModule) => (
        <section key={courseModule.id} className="admin-module">
          <h2>{courseModule.title}</h2>
          {courseModule.lessons.map((lesson) => (
            <LessonEditor
              key={lesson.id}
              lesson={lesson}
              onSaved={(updated) => updateLessonInState(courseModule.id, updated)}
              onDeleted={(id) => removeLessonFromState(courseModule.id, id)}
            />
          ))}
          <NewLessonForm
            moduleId={courseModule.id}
            nextOrder={courseModule.lessons.length + 1}
            onCreated={(created) => addLessonToState(courseModule.id, created)}
          />
        </section>
      ))}
    </div>
  );
}
