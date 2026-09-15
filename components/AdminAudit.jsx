"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/icons";

// Підписи дій журналу (lib/audit.ts). Невідома дія показується як є.
const ACTION_LABELS = {
  "enrollment.update": "Корекція проходження",
  "enrollment.delete": "Знято призначення",
  "employee.update": "Зміна картки співробітника",
  "employee.create": "Створено співробітника",
  "employee.import": "Імпорт співробітників",
  "badge.award": "Видано відзнаку",
  "badge.revoke": "Відкликано відзнаку",
  "pin.reset": "Скинуто PIN",
  "course.assign": "Призначено курс",
  "course.delete": "Видалено курс",
  "course.unassign_all": "Знято всі призначення курсу",
  "rating.rules.update": "Змінено ваги рейтингу",
  "rating.recalculate": "Перерахунок рейтингу",
  "token.create": "Створено Excel-токен",
  "token.revoke": "Відкликано Excel-токен",
};
const TYPE_LABELS = { enrollment: "призначення", employee: "співробітник", course: "курс", rating: "рейтинг", token: "токен" };

/** /admin/audit — журнал дій адміна: коли, що, над чим, з якими даними. */
export function AdminAudit() {
  const [data, setData] = useState(null);
  const [targetType, setTargetType] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (targetType) params.set("targetType", targetType);
    if (q) params.set("q", q);
    const t = setTimeout(() => fetch(`/api/admin/audit?${params}`).then((r) => r.json()).then(setData), 250);
    return () => clearTimeout(t);
  }, [targetType, q]);

  return (
    <div className="admin-page">
      <h1>Журнал дій</h1>
      <p className="admin-subtitle">Усі зміни з адмін-панелі: призначення, корекції, відзнаки, ваги рейтингу, токени. Лише читання.</p>

      <div className="admin-audit-toolbar">
        <select className="admin-select" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
          <option value="">Усі об&apos;єкти</option>
          {(data?.types || []).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] || t}
            </option>
          ))}
        </select>
        <input className="admin-input-flex" placeholder="Дія, напр. badge…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!data ? (
        <p className="admin-hint">
          <SpinnerIcon /> Завантаження…
        </p>
      ) : data.entries.length === 0 ? (
        <p className="admin-hint">Записів поки нема.</p>
      ) : (
        <div className="admin-employee-table admin-audit-table">
          <div className="admin-employee-row admin-employee-row-head">
            <span>Коли</span>
            <span>Дія</span>
            <span>Об&apos;єкт</span>
            <span>Деталі</span>
          </div>
          {data.entries.map((e) => (
            <div
              key={e.id}
              className="admin-employee-row"
              role="button"
              tabIndex={0}
              onClick={() => setOpen(open === e.id ? null : e.id)}
              onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), setOpen(open === e.id ? null : e.id))}
            >
              <span className="admin-employee-meta">{new Date(e.createdAt).toLocaleString("uk-UA")}</span>
              <span>{ACTION_LABELS[e.action] || e.action}</span>
              <span className="admin-employee-meta">
                {TYPE_LABELS[e.targetType] || e.targetType}
                {e.targetId != null && ` #${e.targetId}`}
              </span>
              <span className={`admin-audit-details${open === e.id ? " open" : ""}`}>{e.details ? JSON.stringify(e.details) : "—"}</span>
            </div>
          ))}
          {data.entries.length >= data.limit && <p className="admin-hint">Показано останні {data.limit} записів.</p>}
        </div>
      )}
    </div>
  );
}
