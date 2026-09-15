"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { TerritoryPicker } from "@/components/TerritoryPicker";

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
  // Довідники для масової видачі — ті самі ендпоінти, що й пікер
  // призначення курсу (AdminDashboard.jsx).
  const [targets, setTargets] = useState({ positions: [], territories: [], employees: [] });

  async function load() {
    setLoading(true);
    try {
      const [b, positions, terr] = await Promise.all([
        fetch("/api/admin/badges").then((r) => r.json()),
        fetch("/api/admin/positions").then((r) => r.json()),
        fetch("/api/admin/territories").then((r) => r.json()),
      ]);
      setBadges(b.badges || []);
      setTargets({ positions: positions || [], territories: terr.territories || [], employees: terr.employees || [] });
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
        конкретного співробітника або одразу групі — «Призначити» в рядку.
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
            <BadgeRow
              key={b.id}
              badge={b}
              targets={targets}
              onUpdated={(updated) => setBadges((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))}
              onDeleted={(id) => setBadges((prev) => prev.filter((x) => x.id !== id))}
            />
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
  const [points, setPoints] = useState(50);
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
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null, icon: icon.trim() || "⭐", points: Number(points) || 0 }),
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
        <div className="admin-field">
          <label className="admin-label" htmlFor="badgePoints">
            Бали рейтингу
          </label>
          <input id="badgePoints" type="number" min="0" className="admin-input-flex" value={points} onChange={(e) => setPoints(e.target.value)} style={{ maxWidth: 100 }} />
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

function BadgeRow({ badge, targets, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Видалення — лише manual; якщо відзнаку вже видано, сервер відповідає
  // 409 з кількістю, і адмін підтверджує видалення разом із видачами
  // (і їхніми балами рейтингу).
  async function handleDelete() {
    if (!window.confirm(`Видалити тип «${badge.title}»?`)) return;
    setDeleting(true);
    try {
      let res = await fetch(`/api/admin/badges/${badge.id}`, { method: "DELETE" });
      if (res.status === 409) {
        const data = await res.json();
        if (!window.confirm(`${data.error} Видалити разом із цими видачами та їхніми балами рейтингу?`)) return;
        res = await fetch(`/api/admin/badges/${badge.id}?force=1`, { method: "DELETE" });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onDeleted(badge.id);
    } catch (err) {
      window.alert("Не вдалося видалити: " + err.message);
    } finally {
      setDeleting(false);
    }
  }
  const [title, setTitle] = useState(badge.title);
  const [description, setDescription] = useState(badge.description || "");
  const [icon, setIcon] = useState(badge.icon || "");
  const [points, setPoints] = useState(badge.points ?? 0);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/badges/${badge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null, icon: icon.trim() || null, points: Number(points) || 0 }),
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
          <input type="number" min="0" className="admin-input-flex" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Бали рейтингу" style={{ maxWidth: 140 }} />
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
    <>
      <div className="admin-badge-row">
        <span style={{ fontSize: 20 }}>{badge.icon}</span>
        <span>
          {badge.title}
          {badge.description && <div className="admin-hint">{badge.description}</div>}
          <div className="admin-hint">{badge.points ? `${badge.points} балів рейтингу` : "без балів"}</div>
        </span>
        <span>{KIND_LABELS[badge.kind]}</span>
        <span className="admin-badge-actions">
          {badge._count?.awards ?? 0}
          <button className="admin-btn-link" onClick={() => setEditing(true)}>
            Редагувати
          </button>
          {badge.kind === "manual" && (
            <>
              <button className="admin-btn-link" onClick={() => setAwarding((v) => !v)} aria-expanded={awarding}>
                {awarding ? "Сховати видачу" : "Призначити"}
              </button>
              <button className="admin-btn-link admin-link-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Видаляю…" : "Видалити"}
              </button>
            </>
          )}
        </span>
      </div>
      {awarding && (
        <BadgeAwardPanel
          badge={badge}
          targets={targets}
          onDone={(count) => {
            onUpdated({ id: badge.id, _count: { awards: (badge._count?.awards ?? 0) + count } });
          }}
        />
      )}
    </>
  );
}

/**
 * Масова видача ручної відзнаки — те саме «дерево», що й у призначенні
 * курсу: посади, території/конкретні люди (TerritoryPicker), коментар.
 * Хто вже має відзнаку — пропускається (сервер, skipDuplicates).
 */
function BadgeAwardPanel({ badge, targets, onDone }) {
  const [positionCodes, setPositionCodes] = useState([]);
  const [territoryIds, setTerritoryIds] = useState([]);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const nothing = positionCodes.length === 0 && territoryIds.length === 0 && employeeIds.length === 0;

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/badges/${badge.id}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionCodes, territoryIds, employeeIds, note: note.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMsg(`Видано ${data.awardedCount} співробітник(ам)${data.skippedCount > 0 ? `, ${data.skippedCount} уже мали цю відзнаку` : ""}.`);
      onDone(data.awardedCount);
    } catch (err) {
      setMsg("Помилка: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-badge-award">
      <div className="admin-field">
        <span className="admin-label">За посадами</span>
        <div className="admin-checkbox-grid">
          {targets.positions.map((p) => (
            <label key={p.code} className="admin-checkbox">
              <input
                type="checkbox"
                checked={positionCodes.includes(p.code)}
                onChange={(e) => setPositionCodes((v) => (e.target.checked ? [...v, p.code] : v.filter((c) => c !== p.code)))}
              />
              {p.name} ({p.code})
            </label>
          ))}
        </div>
      </div>
      <div className="admin-field">
        <span className="admin-label">За територіями / конкретним людям</span>
        <TerritoryPicker
          territories={targets.territories}
          employees={targets.employees}
          value={territoryIds}
          onChange={setTerritoryIds}
          employeeValue={employeeIds}
          onEmployeeChange={setEmployeeIds}
        />
        <p className="admin-hint">Посада + територія = усі з цієї посади на цій території; лише територія = усі на ній; людина — лише вона.</p>
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor={`awardNote${badge.id}`}>
          Коментар (опційно, потрапить у сповіщення)
        </label>
        <input id={`awardNote${badge.id}`} className="admin-input-flex" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="admin-btn-group">
        <button type="button" className="admin-btn" onClick={submit} disabled={busy || nothing}>
          {busy && <SpinnerIcon />}
          Видати {badge.icon} {badge.title}
        </button>
        {msg && <span className="admin-hint">{msg}</span>}
      </div>
    </div>
  );
}
