"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpinnerIcon } from "@/components/ui/icons";
import { LoadingLine } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/localDate";

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
      const data = await api(`/api/admin/employees/${employeeId}/badges`, { method: "POST", body: { badgeId: Number(selectedBadgeId), note: note.trim() || null } });
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
    if (!window.confirm("Відкликати цю винагороду?")) return;
    await fetch(`/api/admin/employees/${employeeId}/badges/${employeeBadgeId}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return (
      <LoadingLine />
    );
  }

  return (
    <section className="adm-card adm-wide">
      <div className="adm-card-head">
        <h2>Відзнаки та винагороди</h2>
        <span className="admin-hint">{awards.length ? `${awards.length} отримано` : "поки нічого"}</span>
      </div>

      {awards.length === 0 ? (
        <p className="admin-subtitle">Ще немає жодної відзнаки чи винагороди.</p>
      ) : (
        <ul className="admin-badge-list">
          {awards.map((a) => (
            <li key={a.id} className="admin-badge-list-item" title={a.badge.description || ""}>
              <span className="admin-badge-list-ico">{a.badge.icon}</span>
              <span className="admin-badge-list-body">
                <strong>{a.badge.title}</strong>
                <span className="admin-hint">
                  {formatDate(a.awardedAt)}
                  {a.awardedBy ? ` · від ${a.awardedBy.name}` : " · автоматично"}
                  {a.note ? ` · ${a.note}` : ""}
                </span>
              </span>
              <button className="admin-btn adm-btn-danger" onClick={() => handleRevoke(a.id)}>
                Відкликати
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="adm-field-grid">
        <div className="admin-field">
          <label className="admin-label" htmlFor="awardBadge">
            Видати винагороду
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
          Немає жодного типу винагороди — створіть на сторінці{" "}
          <Link className="admin-btn-link" href="/admin/badges">
            Відзнаки та винагороди
          </Link>
          .
        </p>
      )}
      <div className="adm-card-foot">
        {error && <p className="admin-error">{error}</p>}
        <button className="admin-btn" disabled={!selectedBadgeId || awarding} onClick={handleAward}>
          {awarding && <SpinnerIcon />}
          Видати
        </button>
      </div>
    </section>
  );
}
