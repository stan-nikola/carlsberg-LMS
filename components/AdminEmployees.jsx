"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronIcon, SpinnerIcon } from "@/components/icons";
import { EmployeeDrawer } from "@/components/EmployeeDrawer";
import { EMPLOYEE_DEPARTMENTS } from "@/lib/employeeDepartments";

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
    <div className="admin-form-section adm-create-panel">
      <span className="admin-form-section-title">Новий співробітник</span>
      <div className="admin-form-columns adm-create-columns">
        <div className="admin-field">
          <label className="admin-label" htmlFor="newEmpName">
            Ім&apos;я
          </label>
          <input id="newEmpName" className="admin-input-flex" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
        <div className="admin-field">
          <label className="admin-label" htmlFor="newEmpEmail">
            Email (опційно)
          </label>
          <input id="newEmpEmail" type="email" className="admin-input-flex" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
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
 * /admin/employees — список людей і тільки він. Рядок — лише читання (ім'я,
 * код, департамент, посада, роль, статус); клік відкриває картку бічною
 * панеллю (components/EmployeeDrawer.tsx), де вже є всі дії — роль,
 * скидання PIN, деактивація, керівник, курси, ачивки. Раніше select ролі
 * й кнопка PIN стояли в КОЖНОМУ рядку: 1600+ форм на екрані заради дій,
 * які роблять раз на рік, і реальний ризик змінити роль скролом над
 * select. Дерево організації й робота з базою переїхали на /admin/org і
 * /admin/data — це інші інструменти, а не інші вигляди цього списку.
 *
 * ?id=… у URL — відкрита панель: посилання можна передати колезі, а після
 * F5 картка лишається відкритою.
 */
export function AdminEmployees() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const idParam = Number(searchParams.get("id"));
  const selectedId = Number.isFinite(idParam) && idParam > 0 ? idParam : null;

  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [limit, setLimit] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/employees?q=${encodeURIComponent(q)}&showInactive=${showInactive ? "1" : "0"}&department=${encodeURIComponent(department)}`,
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
  }, [q, department, showInactive]);

  const openEmployee = useCallback(
    (id) => router.replace(`${pathname}?id=${id}`, { scroll: false }),
    [router, pathname]
  );
  const closeEmployee = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);

  // Картка в панелі щось змінила — оновлюємо той самий рядок у списку, не
  // перезапитуючи все (пошук/фільтри/скрол лишаються як були).
  const handleChanged = useCallback((updated) => {
    if (!updated?.id) return;
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === updated.id
          ? {
              ...e,
              name: updated.name ?? e.name,
              email: updated.email ?? e.email,
              role: updated.role ?? e.role,
              isActive: updated.isActive ?? e.isActive,
              department: updated.department ?? e.department,
              position: updated.position ?? e.position,
              territory: updated.territory ?? e.territory,
            }
          : e
      )
    );
  }, []);

  return (
    <div className="admin-page">
      <div className="adm-page-head">
        <div>
          <h1>Співробітники</h1>
          <p className="admin-subtitle">Знайдіть людину за ім&apos;ям або кодом — картка відкриється поруч.</p>
        </div>
        <button type="button" className="admin-btn" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Скасувати" : "+ Новий співробітник"}
        </button>
      </div>

      {showCreate && (
        <EmployeeCreateForm
          onCreated={(created) => {
            setShowCreate(false);
            setEmployees((prev) => [created, ...prev]);
            openEmployee(created.id);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="adm-filters">
        <input
          className="admin-input-flex"
          placeholder="Ім'я або код (напр. RNE104)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="admin-select" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">Усі департаменти</option>
          {EMPLOYEE_DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
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
            <span>Департамент</span>
            <span>Посада / територія</span>
            <span>Роль</span>
            <span />
          </div>
          {employees.map((emp) => (
            <button
              type="button"
              key={emp.id}
              className={`admin-employee-row adm-emp-row${emp.isActive === false ? " emp-tree-row-inactive" : ""}${
                selectedId === emp.id ? " is-selected" : ""
              }`}
              onClick={() => openEmployee(emp.id)}
            >
              <span className="adm-emp-name">
                {emp.name}
                {emp.isActive === false && <span className="adm-chip adm-chip-off">деактивовано</span>}
              </span>
              <span className="mono">{emp.externalCode}</span>
              <span className="admin-employee-meta">{emp.department || "—"}</span>
              <span className="admin-employee-meta">
                {emp.position?.name || "—"}
                {emp.territory ? ` · ${emp.territory.name}` : ""}
              </span>
              <span>
                {/* Звичайна роль — приглушено (це 99% рядків), підвищені —
                    акцентом, щоб адміни/HR читались з першого погляду. */}
                <span className={`adm-chip${emp.role !== "employee" ? " adm-chip-accent" : ""}`}>
                  {ROLE_LABELS[emp.role] || emp.role}
                </span>
              </span>
              <span className="adm-emp-chevron" aria-hidden="true">
                <ChevronIcon />
              </span>
            </button>
          ))}
        </div>
      )}
      {!q && limit && employees.length === limit && (
        <p className="admin-hint" style={{ marginTop: 12 }}>
          Показано перші {limit} за алфавітом — введіть ім&apos;я або код, щоб знайти конкретну людину.
        </p>
      )}

      {selectedId && <EmployeeDrawer employeeId={selectedId} onClose={closeEmployee} onChanged={handleChanged} />}
    </div>
  );
}
