"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/ui/icons";
import { LoadingLine } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/localDate";

/**
 * "Жива" Excel-книга (Фаза B3) — керування персональними токенами
 * (app/api/admin/tokens) для Power Query-підключення до app/api/data/*.
 * Сирий токен показується ОДИН раз одразу після створення — далі в базі
 * лише його хеш, повторно показати неможливо (лише відкликати й створити
 * новий).
 */
export function ExcelLivePanel() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminCandidates, setAdminCandidates] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [justCreatedToken, setJustCreatedToken] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [tokensRes, adminRes, hrRes] = await Promise.all([
        fetch("/api/admin/tokens"),
        fetch("/api/admin/employees?q=&showInactive=1"),
        null,
      ]);
      const tokensData = await tokensRes.json();
      setTokens(tokensData.tokens || []);
      // Кандидати на токен — лише role admin/hr_manager (перевіряється й
      // на сервері при POST, тут лише для зручності вибору), тому одного
      // короткого пошук-невибіркового списку достатньо: таких людей
      // реалістично одиниці-десятки, не 1900+.
      const adminData = await adminRes.json();
      setAdminCandidates((adminData.employees || []).filter((e) => e.role === "admin" || e.role === "hr_manager"));
    } catch {
      setError("Не вдалося завантажити токени.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!selectedEmployeeId) return;
    setCreating(true);
    setError("");
    setJustCreatedToken(null);
    try {
      const data = await api("/api/admin/tokens", { method: "POST", body: { employeeId: Number(selectedEmployeeId), label: label.trim() || null } });
      setJustCreatedToken(data.token);
      setLabel("");
      await load();
    } catch (err) {
      setError("Помилка: " + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId) {
    if (!window.confirm("Відкликати цей токен? Excel-підключення з ним перестане оновлюватись.")) return;
    await fetch(`/api/admin/tokens/${tokenId}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <p className="admin-subtitle">
        Excel сам підключається до бази й оновлюється кнопкою «Оновити все» — без заходу на сайт. Токен персональний
        (прив&apos;язаний до конкретного admin/hr_manager акаунту), а не спільний пароль /admin.
      </p>

      {/* Інструкція ліворуч, видача токена праворуч — на широкому екрані
          поруч, на вузькому одне під одним (.adm-split). */}
      <div className="adm-split">
      <div className="adm-inset">
        <h3>Як підключити (Excel → Power Query)</h3>
        <ol className="admin-subtitle">
          <li>
            Дані → Отримати дані → З інших джерел → З Інтернету (Get Data → From Web), URL: <code>{"{origin}"}/api/data/employees</code>{" "}
            (і так само <code>/api/data/courses</code>, <code>/api/data/enrollments</code> — три окремі запити).
          </li>
          <li>У додаткових параметрах (HTTP request header) додайте заголовок: `Authorization: Bearer &lt;ваш токен&gt;`.</li>
          <li>Завантажте всі три таблиці в модель даних (Load To → Only Create Connection → Add to Data Model).</li>
          <li>Зв&apos;яжіть таблиці в Power Pivot: enrollments.employeeId → employees.id, enrollments.courseId → courses.id.</li>
          <li>Будуйте PivotTable/PivotChart як завгодно. Кнопка «Оновити все» тягне свіжі дані напряму з бази.</li>
        </ol>
      </div>

      {loading ? (
        <LoadingLine />
      ) : (
        <div className="adm-stack">
          <div className="adm-field-grid">
            <div className="admin-field">
              <label className="admin-label" htmlFor="tokenEmployee">
                Кому видати токен
              </label>
              <select
                id="tokenEmployee"
                className="admin-select"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                <option value="">—</option>
                {adminCandidates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.email || "без email"})
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="tokenLabel">
                Підпис (опційно)
              </label>
              <input
                id="tokenLabel"
                className="admin-input-flex"
                placeholder="напр. Excel — Станіслав"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>
          {adminCandidates.length === 0 && (
            <p className="admin-hint">
              Немає жодного співробітника з роллю admin/hr_manager — призначте роль у картці людини (Співробітники → картка → Роль), перш ніж
              створювати токен.
            </p>
          )}
          {error && <p className="admin-error">{error}</p>}
          <button className="admin-btn" disabled={!selectedEmployeeId || creating} onClick={handleCreate}>
            {creating && <SpinnerIcon />}
            Створити токен
          </button>

          {justCreatedToken && (
            <div className="adm-inset adm-inset-accent">
              <p className="admin-subtitle">
                <strong>Скопіюйте зараз — повторно показати неможливо (у базі лише хеш):</strong>
              </p>
              <code className="adm-code">{justCreatedToken}</code>
            </div>
          )}
        </div>
      )}
      </div>

      {!loading && (
          <div className="adm-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Кому видано</th>
                <th>Підпис</th>
                <th>Створено</th>
                <th>Останнє використання</th>
                <th>Дія</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr className={t.revokedAt ? "emp-tree-row-inactive" : undefined} key={t.id}>
                  <td>
                    {t.employee.name}
                    {t.employee.email ? ` (${t.employee.email})` : ""}
                  </td>
                  <td>{t.label || "—"}</td>
                  <td>{formatDate(t.createdAt)}</td>
                  <td>{t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "ще жодного разу"}</td>
                  <td className="adm-actions-cell">
                    {t.revokedAt ? (
                      "відкликано"
                    ) : (
                      <button className="admin-btn adm-btn-danger" onClick={() => handleRevoke(t.id)}>
                        Відкликати
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
      )}
    </>
  );
}
