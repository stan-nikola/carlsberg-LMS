"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpinnerIcon } from "@/components/icons";

const ROLE_LABELS = {
  employee: "Співробітник",
  admin: "Адміністратор",
  hr_manager: "HR-менеджер",
};

/**
 * Детальна картка співробітника (Фаза A адмінки) — повний редактор полів,
 * на відміну від AdminEmployees.jsx (лише роль + скидання PIN). Вкладки
 * "Ачивки" (Фаза C) і "Курси" (Фаза D — ручна корекція проходження) сюди
 * додаються окремими наступними кроками плану, тут поки лише сам
 * редактор картки + перепризначення керівника + (де)активація.
 */
export function EmployeeDetail({ employeeId }) {
  const [employee, setEmployee] = useState(null);
  const [positions, setPositions] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  // Локальний стан форми — окремо від "employee" (серверної правди), щоб
  // не змінювати поля прямо на кожен keystroke без явного збереження.
  const [form, setForm] = useState(null);

  // Пошук майбутнього керівника — той самий дебаунс-патерн, що
  // AdminEmployees.jsx.
  const [managerQuery, setManagerQuery] = useState("");
  const [managerResults, setManagerResults] = useState([]);
  const [managerSearching, setManagerSearching] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [empRes, posRes, terRes] = await Promise.all([
        fetch(`/api/admin/employees/${employeeId}`),
        fetch("/api/admin/positions"),
        fetch("/api/admin/territories"),
      ]);
      if (!empRes.ok) throw new Error(`HTTP ${empRes.status}`);
      const emp = await empRes.json();
      const pos = await posRes.json();
      const ter = await terRes.json();
      setEmployee(emp);
      setForm({
        name: emp.name,
        email: emp.email || "",
        role: emp.role,
        positionId: emp.positionId || "",
        territoryId: emp.territoryId || "",
        isActive: emp.isActive,
      });
      setPositions(pos);
      setTerritories((ter.territories || []).slice().sort((a, b) => a.name.localeCompare(b.name, "uk")));
    } catch {
      setError("Не вдалося завантажити картку співробітника.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  useEffect(() => {
    if (!managerQuery.trim()) {
      // Реакція на "пошук очищено" — той самий патерн, що вже є в
      // AdminEmployees.jsx для loading: зовнішня подія (зміна managerQuery)
      // щойно почалась, це не похідне значення з наявного стану.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManagerResults([]);
      return;
    }
    const controller = new AbortController();
    setManagerSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/employees?q=${encodeURIComponent(managerQuery)}&showInactive=1`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setManagerResults((data.employees || []).filter((e) => e.id !== employeeId));
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      } finally {
        setManagerSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [managerQuery, employeeId]);

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          role: form.role,
          positionId: form.positionId === "" ? null : Number(form.positionId),
          territoryId: form.territoryId === "" ? null : Number(form.territoryId),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setEmployee(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReassignManager(managerId) {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setEmployee(updated);
      setManagerQuery("");
      setManagerResults([]);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    const nextActive = !employee.isActive;
    if (
      nextActive === false &&
      (employee._count.subordinates > 0 || employee._count.enrollments > 0) &&
      !window.confirm(
        `У «${employee.name}» ${employee._count.subordinates} підлеглих і ${employee._count.enrollments} призначених курсів — вони залишаться недоторканими, деактивується лише вхід цієї людини. Продовжити?`
      )
    ) {
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setEmployee(updated);
      setForm((f) => ({ ...f, isActive: updated.isActive }));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="admin-subtitle">
        <SpinnerIcon />
        Завантаження…
      </p>
    );
  }
  if (error) return <p className="admin-error">{error}</p>;
  if (!employee || !form) return null;

  return (
    <div className="admin-page">
      <Link href="/admin/employees" className="admin-btn-link">
        ← До списку співробітників
      </Link>
      <h1 style={{ marginTop: 12 }}>
        {employee.name}
        {!employee.isActive && <span className="admin-hint"> · деактивовано</span>}
      </h1>
      <p className="admin-subtitle mono">{employee.externalCode}</p>

      <div className="admin-form-section">
        <div className="admin-form-columns">
          <div className="admin-field">
            <label className="admin-label" htmlFor="empName">
              Ім&apos;я
            </label>
            <input
              id="empName"
              className="admin-input-flex"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="empEmail">
              Email
            </label>
            <input
              id="empEmail"
              type="email"
              className="admin-input-flex"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
        </div>

        <div className="admin-form-columns">
          <div className="admin-field">
            <label className="admin-label" htmlFor="empPosition">
              Посада
            </label>
            <select
              id="empPosition"
              className="admin-select"
              value={form.positionId}
              onChange={(e) => setForm((f) => ({ ...f, positionId: e.target.value }))}
            >
              <option value="">—</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="empTerritory">
              Територія
            </label>
            <select
              id="empTerritory"
              className="admin-select"
              value={form.territoryId}
              onChange={(e) => setForm((f) => ({ ...f, territoryId: e.target.value }))}
            >
              <option value="">—</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="admin-field">
          <label className="admin-label" htmlFor="empRole">
            Роль
          </label>
          <select
            id="empRole"
            className="admin-select"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {saveError && <p className="admin-error">{saveError}</p>}
        <div className="admin-btn-group">
          <button className="admin-btn" disabled={saving} onClick={handleSave}>
            {saving && <SpinnerIcon />}
            {saved ? "Збережено ✓" : "Зберегти"}
          </button>
          <button className="admin-btn-danger" disabled={saving} onClick={handleToggleActive}>
            {employee.isActive ? "Деактивувати" : "Активувати"}
          </button>
        </div>
      </div>

      <div className="admin-form-section">
        <h2 style={{ fontSize: 15 }}>Керівник</h2>
        <p className="admin-subtitle">
          {employee.manager ? (
            <>
              {employee.manager.name} (
              <Link href={`/admin/employees/${employee.manager.id}`} className="admin-btn-link">
                картка
              </Link>
              )
            </>
          ) : (
            "— верхній рівень ієрархії, керівника немає"
          )}
        </p>
        <input
          className="admin-input-flex"
          placeholder="Пошук нового керівника за ім'ям або кодом…"
          value={managerQuery}
          onChange={(e) => setManagerQuery(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        {managerSearching && <SpinnerIcon />}
        {managerResults.length > 0 && (
          <ul className="admin-block-list" style={{ marginTop: 8 }}>
            {managerResults.map((m) => (
              <li key={m.id} className="admin-block-list-item">
                <button
                  type="button"
                  className="admin-block-list-link"
                  style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer" }}
                  onClick={() => handleReassignManager(m.id)}
                >
                  {m.name} · <span className="mono">{m.externalCode}</span>
                  {m.position ? ` · ${m.position.name}` : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
        {employee.manager && (
          <button
            type="button"
            className="admin-btn-link"
            style={{ marginTop: 8 }}
            onClick={() => handleReassignManager(null)}
          >
            Зробити керівником верхнього рівня (прибрати керівника)
          </button>
        )}
      </div>

      <div className="admin-form-section">
        <h2 style={{ fontSize: 15 }}>Підпорядкування й курси</h2>
        <p className="admin-subtitle">
          Прямих підлеглих: {employee._count.subordinates} · Призначених курсів: {employee._count.enrollments}
        </p>
        <Link href="/admin/employees?view=tree" className="admin-btn-link">
          Переглянути в дереві організації →
        </Link>
      </div>
    </div>
  );
}
