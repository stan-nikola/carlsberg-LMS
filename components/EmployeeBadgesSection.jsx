"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpinnerIcon } from "@/components/icons";

/**
 * Вкладка "Ачивки" на детальній картці співробітника (Фаза C) — список
 * уже виданих (авто + ручних) + форма ручної видачі (лише kind=manual
 * типи, авто нараховуються тільки cron-ом — lib/badgeRules.js).
 */
export function EmployeeBadgesSection({ employeeId }) {
  const [awards, setAwards] = useState([]);
  const [manualBadges, setManualBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBadgeId, setSelectedBadgeId] = useState("");
  const [note, setNote] = useState("");
  const [awarding, setAwarding] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [awardsRes, badgesRes] = await Promise.all([
        fetch(`/api/admin/employees/${employeeId}/badges`),
        fetch("/api/admin/badges"),
      ]);
      const awardsData = await awardsRes.json();
      const badgesData = await badgesRes.json();
      setAwards(awardsData.awards || []);
      setManualBadges((badgesData.badges || []).filter((b) => b.kind === "manual"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  async function handleAward() {
    if (!selectedBadgeId) return;
    setAwarding(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/badges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badgeId: Number(selectedBadgeId), note: note.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSelectedBadgeId("");
      setNote("");
      await load();
    } catch (err) {
      setError("Помилка: " + err.message);
    } finally {
      setAwarding(false);
    }
  }

  async function handleRevoke(employeeBadgeId) {
    if (!window.confirm("Відкликати цю ачивку?")) return;
    await fetch(`/api/admin/employees/${employeeId}/badges/${employeeBadgeId}`, { method: "DELETE" });
    await load();
  }

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
      <h2 style={{ fontSize: 15 }}>Ачивки й заслуги</h2>

      {awards.length === 0 ? (
        <p className="admin-subtitle">Ще немає жодної ачивки.</p>
      ) : (
        <ul className="admin-badge-list" style={{ marginTop: 8 }}>
          {awards.map((a) => (
            <li key={a.id} className="admin-badge-list-item" title={a.badge.description || ""}>
              <span className="admin-badge-list-ico">{a.badge.icon}</span>
              <span className="admin-badge-list-body">
                <strong>{a.badge.title}</strong>
                <span className="admin-hint">
                  {new Date(a.awardedAt).toLocaleDateString("uk-UA")}
                  {a.awardedBy ? ` · від ${a.awardedBy.name}` : " · автоматично"}
                  {a.note ? ` · ${a.note}` : ""}
                </span>
              </span>
              <button className="admin-btn-link" onClick={() => handleRevoke(a.id)}>
                Відкликати
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="admin-form-columns" style={{ marginTop: 16 }}>
        <div className="admin-field">
          <label className="admin-label" htmlFor="awardBadge">
            Видати заслугу
          </label>
          <select id="awardBadge" className="admin-select" value={selectedBadgeId} onChange={(e) => setSelectedBadgeId(e.target.value)}>
            <option value="">—</option>
            {manualBadges.map((b) => (
              <option key={b.id} value={b.id}>
                {b.icon} {b.title}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="awardNote">
            Коментар (опційно)
          </label>
          <input id="awardNote" className="admin-input-flex" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {manualBadges.length === 0 && (
        <p className="admin-hint">
          Немає жодного ручного типу заслуги — створіть на сторінці{" "}
          <Link className="admin-btn-link" href="/admin/badges">
            Ачивки
          </Link>
          .
        </p>
      )}
      {error && <p className="admin-error">{error}</p>}
      <button className="admin-btn" disabled={!selectedBadgeId || awarding} onClick={handleAward}>
        {awarding && <SpinnerIcon />}
        Видати
      </button>
    </div>
  );
}
