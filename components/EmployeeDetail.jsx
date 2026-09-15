"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpinnerIcon } from "@/components/icons";
import { EmployeeBadgesSection } from "@/components/EmployeeBadgesSection";
import { EmployeeCoursesSection } from "@/components/EmployeeCoursesSection";
import { EMPLOYEE_DEPARTMENTS } from "@/lib/employeeDepartments";

const ROLE_LABELS = {
  employee: "Співробітник",
  admin: "Адміністратор",
  hr_manager: "HR-менеджер",
};

/**
 * Детальна картка співробітника (Фаза A адмінки) — повний редактор полів,
 * на відміну від AdminEmployees.jsx (лише роль + скидання PIN). Плюс
 * ачивки (components/EmployeeBadgesSection.jsx, Фаза C) і курси з ручною
 * корекцією проходження (components/EmployeeCoursesSection.jsx, Фаза D).
 */
/**
 * `compact` — рендер усередині бічної панелі (components/EmployeeDrawer.tsx):
 * без обгортки .admin-page і без лінка «← До списку» (список і так видно
 * позаду). `onChanged(updated)` — після успішного збереження/деактивації/
 * переприв'язки, щоб список за панеллю оновив рядок без перезапиту.
 */
export function EmployeeDetail({ employeeId, compact = false, onChanged }) {
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
        department: emp.department || "",
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
          department: form.department || null,
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
      onChanged?.(updated);
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
      onChanged?.(updated);
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
      onChanged?.(updated);
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
    <div className={compact ? "adm-detail-compact" : "admin-page"}>
      {!compact && (
        <Link href="/admin/employees" className="admin-btn-link">
          ← До списку співробітників
        </Link>
      )}
      <div className="adm-detail-head">
        <h1 style={{ marginTop: compact ? 0 : 8 }}>{employee.name}</h1>
        <div className="adm-chip-row">
          <span className="mono">{employee.externalCode}</span>
          <span className={`adm-chip${employee.isActive ? " adm-chip-accent" : " adm-chip-off"}`}>{employee.isActive ? "активний" : "деактивовано"}</span>
          {employee.position && <span className="adm-chip">{employee.position.name}</span>}
          {employee.manager && (
            <span className="admin-hint">
              керівник:{" "}
              <Link href={`/admin/employees/${employee.manager.id}`} className="admin-btn-link">
                {employee.manager.name}
              </Link>
            </span>
          )}
        </div>
      </div>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Основне</h2>
          <span className="admin-hint">Ім’я з email, код — ключ входу</span>
        </div>
        <div className="adm-field-grid">
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
          <div className="admin-field">
            <label className="admin-label" htmlFor="empDepartment">
              Департамент
            </label>
            <select
              id="empDepartment"
              className="admin-select"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            >
              <option value="">—</option>
              {EMPLOYEE_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
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
        </div>

        <div className="adm-card-foot">
          {saveError && <p className="admin-error">{saveError}</p>}
          <button className="admin-btn-link admin-link-danger" disabled={saving} onClick={handleToggleActive}>
            {employee.isActive ? "Деактивувати" : "Активувати"}
          </button>
          <button className="admin-btn" disabled={saving} onClick={handleSave}>
            {saving && <SpinnerIcon />}
            {saved ? "Збережено ✓" : "Зберегти"}
          </button>
        </div>
      </section>

      {/* Дві короткі картки поруч на широкому екрані, стовпчиком у шухляді. */}
      <div className="adm-card-row">
      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Керівник</h2>
          <span className="admin-hint">Пряме підпорядкування; перетягнути в дереві — /admin/org</span>
        </div>
        <div className="adm-manager-row">
          {employee.manager ? (
            <span>
              <b>{employee.manager.name}</b>
              {employee.manager.position?.name ? <span className="admin-hint"> · {employee.manager.position.name}</span> : null}{" "}
              <Link href={`/admin/employees/${employee.manager.id}`} className="admin-btn-link">
                картка →
              </Link>
            </span>
          ) : (
            <span className="admin-hint">Верхній рівень ієрархії — керівника немає</span>
          )}
          {employee.manager && (
            <button type="button" className="admin-btn-link" onClick={() => handleReassignManager(null)}>
              Прибрати керівника
            </button>
          )}
        </div>
        <input
          className="admin-input-flex"
          placeholder="Змінити керівника: пошук за ім’ям або кодом…"
          value={managerQuery}
          onChange={(e) => setManagerQuery(e.target.value)}
          style={{ maxWidth: 420 }}
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
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2>Підпорядкування</h2>
          <Link href={`/admin/org?focus=${employeeId}`} className="admin-btn-link">
            Показати в дереві організації →
          </Link>
        </div>
        <p className="admin-hint" style={{ margin: 0 }}>
          Прямих підлеглих: <b>{employee._count.subordinates}</b>
        </p>
      </section>
      </div>

      <EmployeeBadgesSection employeeId={employeeId} />

      <EmployeeCoursesSection employeeId={employeeId} />
    </div>
  );
}
