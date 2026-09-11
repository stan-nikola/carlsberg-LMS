"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/icons";

const STATUS_LABELS = {
  not_started: "Не розпочато",
  in_progress: "В процесі",
  completed: "Завершено",
  overdue: "Прострочено",
};

/**
 * Вкладка "Курси" на детальній картці співробітника (Фаза D) — список
 * призначених курсів з можливістю ручної корекції (статус/бал/дати —
 * завжди з обов'язковим adminNote, аудит-слід чому) і зняття призначення,
 * плюс призначення нового курсу — виклик уже готового
 * /api/admin/courses/:courseId/assign з employeeIds:[id]
 * (lib/courseAssignment.js), нового бекенду для самого призначення не
 * треба.
 */
export function EmployeeCoursesSection({ employeeId }) {
  const [enrollments, setEnrollments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [enrRes, coursesRes] = await Promise.all([
        fetch(`/api/admin/employees/${employeeId}/enrollments`),
        fetch("/api/admin/courses"),
      ]);
      const enrData = await enrRes.json();
      const coursesData = await coursesRes.json();
      setEnrollments(enrData.enrollments || []);
      setCourses(coursesData || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function handleAssign() {
    if (!selectedCourseId) return;
    setAssigning(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/courses/${selectedCourseId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: [employeeId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSelectedCourseId("");
      await load();
    } catch (err) {
      setError("Помилка призначення: " + err.message);
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(enrollmentId, courseTitle) {
    if (!window.confirm(`Зняти призначення курсу «${courseTitle}» з цієї людини?`)) return;
    await fetch(`/api/admin/enrollments/${enrollmentId}`, { method: "DELETE" });
    await load();
  }

  const assignedCourseIds = new Set(enrollments.map((e) => e.course.id));
  const assignableCourses = courses.filter((c) => !assignedCourseIds.has(c.id));

  if (loading) {
    return (
      <p className="admin-subtitle">
        <SpinnerIcon />
        Завантаження…
      </p>
    );
  }

  return (
    <div className="admin-form-section">
      <h2 style={{ fontSize: 15 }}>Курси</h2>

      {enrollments.length === 0 ? (
        <p className="admin-subtitle">Ще жодного курсу не призначено.</p>
      ) : (
        <div className="admin-badge-table" style={{ marginTop: 8 }}>
          {enrollments.map((e) =>
            editingId === e.id ? (
              <EnrollmentEditRow key={e.id} enrollment={e} onSaved={() => { setEditingId(null); load(); }} onCancel={() => setEditingId(null)} />
            ) : (
              <div className="admin-enrollment-row" key={e.id}>
                <span>
                  {e.course.title}
                  {e.adminNote && <div className="admin-hint">Ручна корекція: {e.adminNote}</div>}
                </span>
                <span>{STATUS_LABELS[e.status] || e.status}</span>
                <span>{e.scorePercent != null ? `${e.scorePercent}%` : "—"}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button className="admin-btn-link" onClick={() => setEditingId(e.id)}>
                    Скорегувати
                  </button>
                  <button className="admin-btn-link" onClick={() => handleUnassign(e.id, e.course.title)}>
                    Зняти
                  </button>
                </span>
              </div>
            )
          )}
        </div>
      )}

      <div className="admin-form-row" style={{ marginTop: 16 }}>
        <select className="admin-select" value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Обрати курс…</option>
          {assignableCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button className="admin-btn" disabled={!selectedCourseId || assigning} onClick={handleAssign}>
          {assigning && <SpinnerIcon />}
          Призначити
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
    </div>
  );
}

function EnrollmentEditRow({ enrollment, onSaved, onCancel }) {
  const [status, setStatus] = useState(enrollment.status);
  const [scorePercent, setScorePercent] = useState(enrollment.scorePercent ?? "");
  const [completedAt, setCompletedAt] = useState(enrollment.completedAt ? enrollment.completedAt.slice(0, 10) : "");
  const [dueDate, setDueDate] = useState(enrollment.dueDate ? enrollment.dueDate.slice(0, 10) : "");
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!adminNote.trim()) {
      setError("Поясніть причину ручної корекції — обов'язково.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/enrollments/${enrollment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          scorePercent: scorePercent === "" ? null : Number(scorePercent),
          completedAt: completedAt || null,
          dueDate: dueDate || null,
          adminNote: adminNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSaved();
    } catch (err) {
      setError("Помилка: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-enrollment-row-edit">
      <div className="admin-form-columns">
        <div className="admin-field">
          <label className="admin-label">Курс</label>
          <p className="admin-subtitle">{enrollment.course.title}</p>
        </div>
        <div className="admin-field">
          <label className="admin-label">Статус</label>
          <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admin-form-columns">
        <div className="admin-field">
          <label className="admin-label">Бал, %</label>
          <input className="admin-input-flex" type="number" min="0" max="100" value={scorePercent} onChange={(e) => setScorePercent(e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Дата завершення</label>
          <input className="admin-input-flex" type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label">Дедлайн</label>
          <input className="admin-input-flex" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Причина ручної корекції (обов&apos;язково)</label>
        <input className="admin-input-flex" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="напр. Пройшов офлайн, підтверджено керівником" />
      </div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-btn-group">
        <button className="admin-btn" disabled={saving} onClick={handleSave}>
          {saving && <SpinnerIcon />}
          Зберегти
        </button>
        <button className="admin-btn-link" onClick={onCancel} disabled={saving}>
          Скасувати
        </button>
      </div>
    </div>
  );
}
