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
  "badge.award": "Видано винагороду",
  "badge.revoke": "Відкликано винагороду",
  "pin.reset": "Скинуто PIN",
  "course.assign": "Призначено курс",
  "course.delete": "Видалено курс",
  "course.unassign_all": "Знято всі призначення курсу",
  "rating.rules.update": "Змінено ваги рейтингу",
  "rating.recalculate": "Перерахунок рейтингу",
  "token.create": "Створено Excel-токен",
  "token.revoke": "Відкликано Excel-токен",
  "badge.create": "Створено тип відзнаки",
  "badge.update": "Змінено тип відзнаки",
  "course.create": "Створено курс",
  "course.update": "Змінено налаштування курсу",
  "module.create": "Додано модуль",
  "module.delete": "Видалено модуль",
  "folder.create": "Створено папку курсів",
  "folder.delete": "Видалено папку курсів",
  "broadcast.send": "Ручна розсилка",
  "broadcast.delete": "Видалено розсилку",
  "design.save": "Збережено дизайн-токени для всіх",
  "design.reset": "Скинуто дизайн-токени до дефолтів",
};
const TYPE_LABELS = { enrollment: "призначення", employee: "співробітник", course: "курс", badge: "відзнака", folder: "папка", broadcast: "розсилка", rating: "рейтинг", token: "токен", design: "дизайн" };

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
        <>
          <table className="admin-table admin-audit-table">
            <thead>
              <tr>
                <th>Коли</th>
                <th>Дія</th>
                <th>Об&apos;єкт</th>
                <th>Деталі</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr
                  key={e.id}
                  className="adm-emp-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                  onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), setOpen(open === e.id ? null : e.id))}
                >
                  <td className="admin-employee-meta">{new Date(e.createdAt).toLocaleString("uk-UA")}</td>
                  <td>{ACTION_LABELS[e.action] || e.action}</td>
                  <td className="admin-employee-meta">
                    {TYPE_LABELS[e.targetType] || e.targetType}
                    {e.targetId != null && ` #${e.targetId}`}
                  </td>
                  <td className={`admin-audit-details${open === e.id ? " open" : ""}`}>{e.details ? JSON.stringify(e.details) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.entries.length >= data.limit && <p className="admin-hint">Показано останні {data.limit} записів.</p>}
        </>
      )}
    </div>
  );
}
