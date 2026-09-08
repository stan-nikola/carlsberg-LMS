"use client";

import { useEffect, useState } from "react";

// Мінімальний, навмисно "чисто функціональний" (без брендового UI
// courses-card) редактор контенту курсу: raw-JSON textarea на екран.
// Це і є "можливість редагування курсів окремо" з ШАГ 3 — далі можна
// замінити на щось приємніше, коли з'явиться реальний контент і буде
// зрозуміло, які поля частіше редагують.

function LessonEditor({ lesson, onSaved, onDeleted }) {
  const [title, setTitle] = useState(lesson.title);
  const [type, setType] = useState(lesson.type);
  const [contentText, setContentText] = useState(JSON.stringify(lesson.content, null, 2));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    let parsed;
    try {
      parsed = JSON.parse(contentText);
    } catch (err) {
      setError("Некоректний JSON: " + err.message);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, content: parsed }),
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="admin-select">
          <option value="info">info</option>
          <option value="quiz">quiz</option>
        </select>
      </div>
      <textarea
        value={contentText}
        onChange={(e) => setContentText(e.target.value)}
        rows={8}
        className="admin-textarea"
      />
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
    const defaultContent = type === "quiz" ? { questionType: "single", options: [] } : { body: "" };
    const res = await fetch("/api/admin/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId, title, type, order: nextOrder, content: defaultContent }),
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
        <option value="info">info</option>
        <option value="quiz">quiz</option>
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
