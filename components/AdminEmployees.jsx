"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/icons";

const ROLE_LABELS = {
  employee: "Співробітник",
  admin: "Адміністратор",
  hr_manager: "HR-менеджер",
};

/**
 * Екран /admin/employees: пошук співробітника (ім'я/код) + для кожного —
 * зміна ролі (Role, надбудова над ієрархією посад) і форсована повторна
 * відправка PIN. Список за замовчуванням показує перших 30 за іменем — при
 * 1900+ співробітниках пошук обов'язковий для конкретної людини.
 */
export function AdminEmployees() {
  const [q, setQ] = useState("");
  const [employees, setEmployees] = useState([]);
  const [limit, setLimit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pinStatus, setPinStatus] = useState({}); // employeeId -> "sending" | "sent" | error message
  const [roleSaving, setRoleSaving] = useState({}); // employeeId -> bool

  useEffect(() => {
    const controller = new AbortController();
    // Синхронізуємо loading-стан із самим ефектом пошуку (реагує на кожну
    // зміну q, включно з дебаунсом нижче) — тут це саме "зовнішня подія
    // почалась", а не похідне значення з наявного стану.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/employees?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setEmployees(data.employees || []);
        setLimit(data.limit ?? null);
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      } finally {
        setLoading(false);
      }
    }, 250); // дебаунс — не бити ендпоінт на кожен натиск клавіші

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

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
      <p className="admin-subtitle">Пошук за ім&apos;ям або кодом — скидання PIN і призначення ролі.</p>

      <input
        className="admin-input-flex"
        placeholder="Ім'я або код (напр. RNE104)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 360, marginTop: 16, marginBottom: 16 }}
      />

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
            <div className="admin-employee-row" key={emp.id}>
              <span>{emp.name}</span>
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
    </div>
  );
}
