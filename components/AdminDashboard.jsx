"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GripIcon } from "@/components/icons";

// Дашборд /admin: курси розгортаються списком своїх блоків (клік по
// заголовку курсу), клік по блоку веде в редактор курсу (components/
// AdminCourseEditor.jsx) одразу до цього блоку (?block=ID). Тут же — форми
// створення нового курсу (назва + всі атрибути, як у CourseSettingsBar
// редактора) і нового блоку всередині вже наявного курсу.

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Список територій із відступами за ієрархією (RM -> ASM -> SV). */
function buildTerritoryOptions(territories) {
  const byId = new Map(territories.map((t) => [t.id, t]));
  function depth(t) {
    let d = 0;
    let cur = t;
    while (cur.parentId) {
      cur = byId.get(cur.parentId);
      if (!cur) break;
      d++;
    }
    return d;
  }
  return territories
    .map((t) => ({ id: t.id, label: `${"— ".repeat(depth(t))}${t.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "uk"));
}

function CourseCreateForm({ positions, territories, onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);
  const [deadlineDays, setDeadlineDays] = useState("");
  const [targetPositions, setTargetPositions] = useState([]);
  const [targetTerritories, setTargetTerritories] = useState([]);
  const [publishAt, setPublishAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const territoryOptions = useMemo(() => buildTerritoryOptions(territories), [territories]);

  function togglePosition(code) {
    setTargetPositions((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          isMandatory,
          deadlineDays: deadlineDays === "" ? null : Number(deadlineDays),
          targetPositions,
          targetTerritories: targetTerritories.map(Number),
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCreated(await res.json());
    } catch (err) {
      setError("Помилка створення: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-course-settings" style={{ marginTop: 0 }}>
      <div className="admin-field admin-course-settings-span2">
        <label className="admin-label">Назва курсу</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" autoFocus />
      </div>
      <div className="admin-field admin-course-settings-span2">
        <label className="admin-label">Опис (необов&apos;язково)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="admin-input-flex" />
      </div>

      <div className="admin-field">
        <label className="admin-label">Дедлайн (днів на проходження)</label>
        <input
          type="number"
          min="0"
          value={deadlineDays}
          onChange={(e) => setDeadlineDays(e.target.value)}
          className="admin-input-flex"
          placeholder="без дедлайну"
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Дата публікації (авто-призначення)</label>
        <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="admin-input-flex" />
      </div>

      <div className="admin-field admin-course-settings-span2">
        <label className="admin-label">Кому призначати — посади</label>
        <div className="admin-checkbox-grid">
          {positions.map((p) => (
            <label key={p.code} className="admin-checkbox">
              <input type="checkbox" checked={targetPositions.includes(p.code)} onChange={() => togglePosition(p.code)} />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="admin-field admin-course-settings-span2">
        <label className="admin-label">Кому призначати — території (необов&apos;язково)</label>
        <select
          multiple
          className="admin-select"
          style={{ width: "100%", height: 92 }}
          value={targetTerritories}
          onChange={(e) => setTargetTerritories(Array.from(e.target.selectedOptions, (o) => o.value))}
        >
          {territoryOptions.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <label className="admin-checkbox">
        <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
        <span>Обов&apos;язковий курс</span>
      </label>

      <div className="admin-status-line">
        {error && <span className="admin-error">{error}</span>}
        <span>
          <button type="button" onClick={onCancel} className="admin-btn-link">
            Скасувати
          </button>{" "}
          <button type="button" onClick={handleCreate} disabled={saving} className="admin-btn">
            {saving ? "Створення…" : "Створити курс"}
          </button>
        </span>
      </div>
    </div>
  );
}

/** Редагування налаштувань уже наявного курсу — той самий набір полів, що
 * й у CourseCreateForm, просто передзаповнений і зберігає через PATCH. */
function CourseSettingsBar({ course, positions, territories, onSaved, onDeleted }) {
  const [title, setTitle] = useState(course.title);
  const [isMandatory, setIsMandatory] = useState(course.isMandatory);
  const [deadlineDays, setDeadlineDays] = useState(course.deadlineDays ?? "");
  const [targetPositions, setTargetPositions] = useState(course.targetPositions);
  const [targetTerritories, setTargetTerritories] = useState(course.targetTerritories.map(String));
  const [publishAt, setPublishAt] = useState(toDatetimeLocalValue(course.publishAt));
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState("");
  const [error, setError] = useState("");

  const territoryOptions = useMemo(() => buildTerritoryOptions(territories), [territories]);

  function togglePosition(code) {
    setTargetPositions((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  // "Кому призначати" вище — це лише збережений НАМІР (Course.targetPositions/
  // targetTerritories), сам по собі він НЕ створює Enrollment (звідси баг:
  // курс налаштований, а співробітник нічого не бачить). Реальне
  // призначення відбувається або тут, вручну, або автоматично по даті
  // публікації (cron, lib/courseAssignment.js publishScheduledCourses).
  async function handleAssignNow() {
    if (targetPositions.length === 0) {
      setError("Спочатку оберіть хоча б одну посаду в «Кому призначати».");
      return;
    }
    setError("");
    setAssignResult("");
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionCodes: targetPositions, territoryIds: targetTerritories.map(Number) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAssignResult(
        `Призначено ${data.assignedCount} співробітник(ів)${data.skippedCount > 0 ? `, ${data.skippedCount} вже мали це призначення раніше` : ""}.`
      );
    } catch (err) {
      setError("Помилка призначення: " + err.message);
    } finally {
      setAssigning(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Видалити курс «${course.title}» повністю — разом з усіма блоками, модулями й екранами? Це незворотно.`
      )
    ) {
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onDeleted(course.id);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          isMandatory,
          deadlineDays: deadlineDays === "" ? null : Number(deadlineDays),
          targetPositions,
          targetTerritories: targetTerritories.map(Number),
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(await res.json());
    } catch (err) {
      setError("Помилка збереження: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const statusText = course.autoAssignedAt
    ? `Опубліковано ${new Date(course.autoAssignedAt).toLocaleString("uk-UA")}`
    : course.publishAt
      ? `Заплановано на ${new Date(course.publishAt).toLocaleString("uk-UA")}`
      : "Не заплановано — призначається лише вручну";

  return (
    <div className="admin-course-settings">
      <div className="admin-field admin-course-settings-span2">
        <label className="admin-label">Назва курсу</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" />
      </div>

      <div className="admin-field">
        <label className="admin-label">Дедлайн (днів на проходження)</label>
        <input
          type="number"
          min="0"
          value={deadlineDays}
          onChange={(e) => setDeadlineDays(e.target.value)}
          className="admin-input-flex"
          placeholder="без дедлайну"
        />
      </div>

      <div className="admin-field">
        <label className="admin-label">Дата публікації (авто-призначення)</label>
        <input
          type="datetime-local"
          value={publishAt}
          onChange={(e) => setPublishAt(e.target.value)}
          className="admin-input-flex"
        />
      </div>

      <div className="admin-field admin-course-settings-span2">
        <label className="admin-label">Кому призначати — посади</label>
        <div className="admin-checkbox-grid">
          {positions.map((p) => (
            <label key={p.code} className="admin-checkbox">
              <input type="checkbox" checked={targetPositions.includes(p.code)} onChange={() => togglePosition(p.code)} />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="admin-field admin-course-settings-span2">
        <label className="admin-label">Кому призначати — території (необов&apos;язково, порожньо = всім із посади)</label>
        <select
          multiple
          className="admin-select"
          style={{ width: "100%", height: 92 }}
          value={targetTerritories}
          onChange={(e) => setTargetTerritories(Array.from(e.target.selectedOptions, (o) => o.value))}
        >
          {territoryOptions.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <label className="admin-checkbox">
        <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
        <span>Обов&apos;язковий курс</span>
      </label>

      {assignResult && <p className="admin-hint">{assignResult}</p>}
      <div className="admin-status-line">
        <span>{statusText}</span>
        <span>
          {error && <span className="admin-error">{error} </span>}
          <button type="button" onClick={handleDelete} disabled={saving} className="admin-btn admin-btn-danger">
            Видалити курс
          </button>{" "}
          <button
            type="button"
            onClick={handleAssignNow}
            disabled={assigning}
            className="admin-btn"
            title="Створити реальні призначення (Enrollment) для обраних посад/територій просто зараз"
          >
            {assigning ? "Призначення…" : "Призначити зараз"}
          </button>{" "}
          <button type="button" onClick={handleSave} disabled={saving} className="admin-btn">
            {saving ? "Збереження…" : "Зберегти налаштування"}
          </button>
        </span>
      </div>
    </div>
  );
}

function NewBlockInlineForm({ courseId, nextOrder, onCreated }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blocks", {
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
      <input placeholder="Назва нового блоку" value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" />
      <button type="button" onClick={handleCreate} disabled={saving} className="admin-btn">
        {saving ? "…" : "+ Додати блок"}
      </button>
    </div>
  );
}

/** Список блоків курсу з перетягуванням (native HTML5 drag-and-drop —
 * бібліотека тут не потрібна, звичайний реордер невеликого списку). Після
 * drop — оптимістично оновлює порядок локально й одразу зберігає
 * order кожного блоку (1..N) через PATCH, щоб не розійтися з базою. */
function BlockList({ courseId, blocks, onReordered }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  async function persistOrder(reordered) {
    await Promise.all(
      reordered.map((block, i) =>
        fetch(`/api/admin/blocks/${block.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i + 1 }),
        })
      )
    );
  }

  function handleDrop(targetIndex) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...blocks];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((b, i) => ({ ...b, order: i + 1 }));
    onReordered(withOrder);
    persistOrder(withOrder);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <ul className="admin-block-list">
      {blocks.map((block, i) => (
        <li
          key={block.id}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => {
            e.preventDefault();
            setOverIndex(i);
          }}
          onDragLeave={() => setOverIndex((v) => (v === i ? null : v))}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={`admin-block-list-item${overIndex === i && dragIndex !== null && dragIndex !== i ? " admin-drag-over" : ""}`}
        >
          <span className="admin-drag-handle" title="Перетягніть, щоб змінити порядок">
            <GripIcon />
          </span>
          <Link href={`/admin/courses/${courseId}?block=${block.id}`} className="admin-block-list-link">
            {block.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CourseRow({ course, positions, territories, onBlockAdded, onBlocksReordered, onCourseSaved, onCourseDeleted }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="admin-course-row">
      <button type="button" className="admin-course-list-link admin-course-row-toggle" onClick={() => setExpanded((v) => !v)}>
        <span>
          <span className="admin-course-row-caret">{expanded ? "▾" : "▸"}</span> {course.title}
        </span>
        <span className="admin-hint">
          /{course.slug} · {course.blocks.length} {course.blocks.length === 1 ? "блок" : "блоків"}
        </span>
      </button>

      {expanded && (
        <div className="admin-course-row-body">
          <CourseSettingsBar
            course={course}
            positions={positions}
            territories={territories}
            onSaved={(updated) => onCourseSaved(course.id, updated)}
            onDeleted={onCourseDeleted}
          />

          <label className="admin-label" style={{ marginTop: 10, display: "block" }}>
            Блоки
          </label>
          {course.blocks.length === 0 ? (
            <p className="admin-hint">Блоків ще немає.</p>
          ) : (
            <BlockList
              courseId={course.id}
              blocks={course.blocks}
              onReordered={(reordered) => onBlocksReordered(course.id, reordered)}
            />
          )}
          <NewBlockInlineForm
            courseId={course.id}
            nextOrder={course.blocks.length + 1}
            onCreated={(created) => onBlockAdded(course.id, created)}
          />
        </div>
      )}
    </li>
  );
}

export function AdminDashboard() {
  const [courses, setCourses] = useState(null);
  const [positions, setPositions] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/courses").then((r) => r.json()),
      fetch("/api/admin/positions").then((r) => r.json()),
      fetch("/api/admin/territories").then((r) => r.json()),
    ])
      .then(([coursesData, positionsData, territoriesData]) => {
        if (cancelled) return;
        setCourses(coursesData);
        setPositions(positionsData);
        setTerritories(territoriesData);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleBlockAdded(courseId, createdBlock) {
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, blocks: [...c.blocks, createdBlock] } : c)));
  }

  function handleBlocksReordered(courseId, reorderedBlocks) {
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, blocks: reorderedBlocks } : c)));
  }

  function handleCourseCreated(createdCourse) {
    setCourses((cs) => [...cs, createdCourse].sort((a, b) => a.title.localeCompare(b.title, "uk")));
    setShowCreate(false);
  }

  // PATCH /api/admin/courses/:id повертає курс БЕЗ blocks — зберігаємо
  // наявні blocks цього курсу, підмінюємо лише скалярні поля.
  function handleCourseSaved(courseId, updated) {
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, ...updated, blocks: c.blocks } : c)));
  }

  function handleCourseDeleted(courseId) {
    setCourses((cs) => cs.filter((c) => c.id !== courseId));
  }

  if (loadError) return <p className="admin-page admin-error">Не вдалося завантажити курси: {loadError}</p>;

  return (
    <div className="admin-page">
      <div className="admin-editor-header">
        <h1>Курси</h1>
        <button type="button" className="admin-btn" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Скасувати" : "+ Додати курс"}
        </button>
      </div>
      <p className="admin-subtitle">Оберіть курс, щоб розгорнути блоки, або блок — щоб редагувати модулі та уроки.</p>

      {showCreate && (
        <CourseCreateForm
          positions={positions}
          territories={territories}
          onCreated={handleCourseCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {!courses ? (
        <p>Завантаження…</p>
      ) : courses.length === 0 ? (
        <p>Курсів ще немає.</p>
      ) : (
        <ul className="admin-course-list">
          {courses.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              positions={positions}
              territories={territories}
              onBlockAdded={handleBlockAdded}
              onBlocksReordered={handleBlocksReordered}
              onCourseSaved={handleCourseSaved}
              onCourseDeleted={handleCourseDeleted}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
