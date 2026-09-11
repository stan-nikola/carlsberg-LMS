"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SpinnerIcon } from "@/components/icons";
import { EmployeeTree } from "@/components/EmployeeTree";

const ROLE_LABELS = {
  employee: "Співробітник",
  admin: "Адміністратор",
  hr_manager: "HR-менеджер",
};

function EmployeeCreateForm({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [externalCode, setExternalCode] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim() || !externalCode.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), externalCode: externalCode.trim(), email: email.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onCreated(data);
    } catch (err) {
      setError("Помилка створення: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-form-section">
      <div className="admin-form-columns">
        <div className="admin-field">
          <label className="admin-label" htmlFor="newEmpName">
            Ім&apos;я
          </label>
          <input id="newEmpName" className="admin-input-flex" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="newEmpCode">
            Код (externalCode)
          </label>
          <input
            id="newEmpCode"
            className="admin-input-flex mono"
            value={externalCode}
            onChange={(e) => setExternalCode(e.target.value)}
            placeholder="напр. RNE999"
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="newEmpEmail">
          Email (опційно)
        </label>
        <input id="newEmpEmail" type="email" className="admin-input-flex" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-btn-group">
        <button className="admin-btn" disabled={saving || !name.trim() || !externalCode.trim()} onClick={handleCreate}>
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

/**
 * Екран /admin/employees: список (пошук + роль + PIN, як і раніше) або
 * дерево організації (EmployeeTree.jsx) — перемикач зверху. Рядки списку
 * тепер клікабельні → детальна картка (components/EmployeeDetail.jsx) з
 * повним редагуванням полів, замість інлайн-редагування лише ролі.
 */
export function AdminEmployees() {
  const searchParams = useSearchParams();
  const [view, setView] = useState(searchParams.get("view") === "tree" ? "tree" : "list");
  const [showCreate, setShowCreate] = useState(false);

  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [limit, setLimit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pinStatus, setPinStatus] = useState({});
  const [roleSaving, setRoleSaving] = useState({});

  useEffect(() => {
    if (view !== "list") return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/employees?q=${encodeURIComponent(q)}&showInactive=${showInactive ? "1" : "0"}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        setEmployees(data.employees || []);
        setLimit(data.limit ?? null);
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, showInactive, view]);

  async function handleResetPin(employeeId) {
    setPinStatus((prev) => ({ ...prev, [employeeId]: "sending" }));
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/reset-pin`, { method: "POST" });
      const data = await res.json();
      setPinStatus((prev) => ({ ...prev, [employeeId]: data.ok ? "sent" : data.error || "error" }));
    } catch {
      setPinStatus((prev) => ({ ...prev, [employeeId]: "error" }));
    }
  }

  async function handleRoleChange(employeeId, role) {
    setRoleSaving((prev) => ({ ...prev, [employeeId]: true }));
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, role: updated.role } : e)));
      }
    } finally {
      setRoleSaving((prev) => ({ ...prev, [employeeId]: false }));
    }
  }

  return (
    <div className="admin-page">
      <h1>Співробітники</h1>
      <p className="admin-subtitle">
        {view === "list"
          ? "Пошук за ім'ям або кодом — картка, скидання PIN і роль."
          : "Дерево підпорядкування — перетягніть вузол на іншого керівника, щоб переприв'язати."}
      </p>

      <div className="admin-btn-group" style={{ marginTop: 16, marginBottom: 16 }}>
        <button className={view === "list" ? "admin-btn" : "admin-btn-link"} onClick={() => setView("list")}>
          Список
        </button>
        <button className={view === "tree" ? "admin-btn" : "admin-btn-link"} onClick={() => setView("tree")}>
          Дерево
        </button>
        <button className="admin-btn-link" onClick={() => setShowCreate((v) => !v)} style={{ marginLeft: "auto" }}>
          + Новий співробітник
        </button>
      </div>

      {showCreate && (
        <EmployeeCreateForm
          onCreated={(created) => {
            setShowCreate(false);
            setEmployees((prev) => [created, ...prev]);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {view === "tree" ? (
        <EmployeeTree />
      ) : (
        <>
          <div className="admin-form-row" style={{ marginBottom: 16 }}>
            <input
              className="admin-input-flex"
              placeholder="Ім'я або код (напр. RNE104)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: 360 }}
            />
            <label className="admin-checkbox">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Показати деактивованих
            </label>
          </div>

          {loading ? (
            <p className="admin-subtitle">
              <SpinnerIcon />
              Завантаження…
            </p>
          ) : employees.length === 0 ? (
            <p className="admin-subtitle">Нікого не знайдено.</p>
          ) : (
            <div className="admin-employee-table">
              <div className="admin-employee-row admin-employee-row-head">
                <span>Ім&apos;я</span>
                <span>Код</span>
                <span>Посада / територія</span>
                <span>Роль</span>
                <span>PIN</span>
              </div>
              {employees.map((emp) => (
                <div className={`admin-employee-row${emp.isActive === false ? " emp-tree-row-inactive" : ""}`} key={emp.id}>
                  <span>
                    <Link href={`/admin/employees/${emp.id}`} className="emp-tree-name">
                      {emp.name}
                    </Link>
                    {emp.isActive === false && <span className="admin-hint"> · деактивовано</span>}
                  </span>
                  <span className="mono">{emp.externalCode}</span>
                  <span className="admin-employee-meta">
                    {emp.position?.name || "—"}
                    {emp.territory ? ` · ${emp.territory.name}` : ""}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <select
                      className="admin-select"
                      value={emp.role}
                      disabled={roleSaving[emp.id]}
                      onChange={(e) => handleRoleChange(emp.id, e.target.value)}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {roleSaving[emp.id] && <SpinnerIcon />}
                  </span>
                  <button
                    className="admin-btn-link"
                    disabled={pinStatus[emp.id] === "sending"}
                    onClick={() => handleResetPin(emp.id)}
                  >
                    {pinStatus[emp.id] === "sending" && <SpinnerIcon />}
                    {pinStatus[emp.id] === "sending"
                      ? "Надсилання…"
                      : pinStatus[emp.id] === "sent"
                        ? "Надіслано ✓"
                        : pinStatus[emp.id] && pinStatus[emp.id] !== "sent"
                          ? "Помилка, ще раз"
                          : "Скинути PIN"}
                  </button>
                </div>
              ))}
            </div>
          )}
          {!q && limit && employees.length === limit && (
            <p className="admin-hint" style={{ marginTop: 12 }}>
              Показано перші {limit} — уточніть пошук, щоб знайти конкретну людину.
            </p>
          )}
        </>
      )}
    </div>
  );
}
