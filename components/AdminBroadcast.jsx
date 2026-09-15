"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/icons";

/**
 * /admin/notifications — ручна розсилка («новини платформи») усім або за
 * посадами + історія. ponytail: території/конкретні люди — API це вміє
 * (target.territoryIds/employeeIds), у формі поки лише посади; додати
 * TerritoryPicker, коли попросять.
 */
export function AdminBroadcast() {
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ title: "", message: "", url: "", all: true, positionCodes: [] });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  async function loadHistory() {
    const d = await fetch("/api/admin/notifications/broadcast").then((r) => r.json());
    setHistory(d.broadcasts || []);
  }
  useEffect(() => {
    fetch("/api/admin/positions")
      .then((r) => r.json())
      .then(setPositions)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, []);

  async function send(e) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          url: form.url || undefined,
          target: form.all ? { all: true } : { positionCodes: form.positionCodes },
        }),
      });
      const d = await res.json();
      setResult(res.ok ? `Надіслано: ${d.created} сповіщень (push на ${d.pushed} пристроїв)` : d.error);
      if (res.ok) {
        setForm((f) => ({ ...f, title: "", message: "", url: "" }));
        loadHistory();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="admin-page">
      <h1>Сповіщення</h1>
      <p className="admin-subtitle">
        Ручна розсилка в центр сповіщень і push на пристрої. Нові курси, дедлайни та ачивки розсилаються автоматично.
      </p>

      <form className="admin-form-section" onSubmit={send}>
        <label className="admin-field">
          <span>Заголовок</span>
          <input className="admin-input-flex" maxLength={80} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Текст</span>
          <textarea className="admin-textarea" maxLength={500} required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Посилання (необов&apos;язково, відносне: /hub/learn)</span>
          <input className="admin-input-flex" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </label>
        <label className="admin-field">
          <span>Кому</span>
          <select className="admin-input-flex" value={form.all ? "all" : "positions"} onChange={(e) => setForm({ ...form, all: e.target.value === "all" })}>
            <option value="all">Усім активним співробітникам</option>
            <option value="positions">За посадами</option>
          </select>
        </label>
        {!form.all && (
          <div className="admin-row ntf-positions">
            {positions.map((p) => (
              <label key={p.code}>
                <input
                  type="checkbox"
                  checked={form.positionCodes.includes(p.code)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      positionCodes: e.target.checked ? [...form.positionCodes, p.code] : form.positionCodes.filter((c) => c !== p.code),
                    })
                  }
                />{" "}
                {p.name} ({p.code})
              </label>
            ))}
          </div>
        )}
        <div className="admin-row">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={sending || (!form.all && form.positionCodes.length === 0)}>
            {sending ? <SpinnerIcon /> : "Надіслати"}
          </button>
          {result && <span className="admin-hint">{result}</span>}
        </div>
      </form>

      <h2>Історія</h2>
      {history.length === 0 ? (
        <p className="admin-hint">Ще нічого не надсилали.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Коли</th>
              <th>Заголовок</th>
              <th>Кому</th>
              <th>Отримали</th>
            </tr>
          </thead>
          <tbody>
            {history.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.createdAt).toLocaleString("uk-UA")}</td>
                <td>
                  <b>{b.title}</b>
                  <div className="admin-hint">{b.message}</div>
                </td>
                <td>{b.targetSummary}</td>
                <td>{b.sentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
