"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/icons";

const KIND_LABELS = { manual: "Ручна (заслуга)", auto: "Автоматична" };

/**
 * /admin/badges — керування ТИПАМИ ачивок (не видачею конкретній людині —
 * та на картці співробітника, components/EmployeeDetail.jsx). auto-типи
 * створюються самі (lib/badgeRules.js ensureAutoBadgesExist) — тут їх
 * можна тільки перейменувати/поміняти опис/іконку, не видалити й не
 * змінити правило нарахування.
 */
export function AdminBadges() {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/badges");
      const data = await res.json();
      setBadges(data.badges || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="admin-page">
      <h1>Ачивки й заслуги</h1>
      <p className="admin-subtitle">
        Типи ачивок. Автоматичні нараховуються щоденним cron за реальними даними; ручні видає адмін з картки
        конкретного співробітника.
      </p>

      <button className="admin-btn" style={{ marginTop: 16, marginBottom: 16 }} onClick={() => setShowCreate((v) => !v)}>
        + Новий тип заслуги
      </button>

      {showCreate && (
        <BadgeCreateForm
          onCreated={(created) => {
            setShowCreate(false);
            setBadges((prev) => [...prev, { ...created, _count: { awards: 0 } }]);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {loading ? (
        <p className="admin-subtitle">
          <SpinnerIcon />
          Завантаження…
        </p>
      ) : (
        <div className="admin-badge-table">
          <div className="admin-badge-row admin-badge-row-head">
            <span>Іконка</span>
            <span>Назва</span>
            <span>Тип</span>
            <span>Видано разів</span>
          </div>
          {badges.map((b) => (
            <BadgeRow key={b.id} badge={b} onUpdated={(updated) => setBadges((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))} />
          ))}
        </div>
      )}
    </div>
  );
}

function BadgeCreateForm({ onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("⭐");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null, icon: icon.trim() || "⭐" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onCreated(data);
    } catch (err) {
      setError("Помилка: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-form-section">
      <div className="admin-form-columns">
        <div className="admin-field">
          <label className="admin-label" htmlFor="badgeTitle">
            Назва
          </label>
          <input id="badgeTitle" className="admin-input-flex" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="напр. Співробітник місяця" />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="badgeIcon">
            Іконка (emoji)
          </label>
          <input id="badgeIcon" className="admin-input-flex" value={icon} onChange={(e) => setIcon(e.target.value)} style={{ maxWidth: 80 }} />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="badgeDesc">
          Опис (опційно)
        </label>
        <input id="badgeDesc" className="admin-input-flex" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-btn-group">
        <button className="admin-btn" disabled={!title.trim() || saving} onClick={handleCreate}>
          {saving && <SpinnerIcon />}
          Створити
        </button>
        <button className="admin-btn-link" onClick={onCancel} disabled={saving}>
          Скасувати
        </button>
      </div>
    </div>
  );
}

function BadgeRow({ badge, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(badge.title);
  const [description, setDescription] = useState(badge.description || "");
  const [icon, setIcon] = useState(badge.icon || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/badges/${badge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null, icon: icon.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdated(data);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="admin-badge-row">
        <span>
          <input className="admin-input-flex" value={icon} onChange={(e) => setIcon(e.target.value)} style={{ maxWidth: 60 }} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input className="admin-input-flex" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="admin-input-flex" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Опис" />
        </span>
        <span>{KIND_LABELS[badge.kind]}</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button className="admin-btn" disabled={saving} onClick={handleSave}>
            {saving && <SpinnerIcon />}
            Зберегти
          </button>
          <button className="admin-btn-link" onClick={() => setEditing(false)} disabled={saving}>
            Скасувати
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="admin-badge-row">
      <span style={{ fontSize: 20 }}>{badge.icon}</span>
      <span>
        {badge.title}
        {badge.description && <div className="admin-hint">{badge.description}</div>}
      </span>
      <span>{KIND_LABELS[badge.kind]}</span>
      <span>
        {badge._count?.awards ?? 0}{" "}
        <button className="admin-btn-link" onClick={() => setEditing(true)}>
          Редагувати
        </button>
      </span>
    </div>
  );
}
