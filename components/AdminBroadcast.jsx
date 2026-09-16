"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon, XIcon } from "@/components/icons";

/**
 * /admin/notifications — ручна розсилка («новини платформи») усім або за
 * посадами + історія. ponytail: території/конкретні люди — API це вміє
 * (target.territoryIds/employeeIds), у формі поки лише посади; додати
 * TerritoryPicker, коли попросять.
 */
export function AdminBroadcast({ children = null }) {
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  // Видалення з історії: по одному (кнопка в рядку) або масово (чекбокси +
  // «обрати все»). Разом із розсилкою зникають і її сповіщення в адресатів.
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  async function removeBroadcasts(ids) {
    const n = ids.length;
    if (!window.confirm(`Видалити ${n === 1 ? "розсилку" : n + " розсилок"}? Повідомлення зникне і з центру сповіщень адресатів.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/notifications/broadcast", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setHistory((h) => h.filter((b) => !ids.includes(b.id)));
      setSelected(new Set());
    } catch (err) {
      window.alert("Не вдалося видалити: " + err.message);
    } finally {
      setDeleting(false);
    }
  }
  const allSelected = history.length > 0 && selected.size === history.length;
  const [form, setForm] = useState({ title: "", message: "", url: "", all: true, positionCodes: [], push: true, telegram: true });
  // Список курсів для поля «Посилання»: обрав курс — адреса /courses/<slug>
  // підставилась сама, руками slug не вгадувати (користувач, 2026-09-15).
  // Групи <optgroup> «папка / підпапка» → курси; курси поза папками — в
  // кінці, під «Без папки».
  const [courseGroups, setCourseGroups] = useState([]);
  useEffect(() => {
    Promise.all([fetch("/api/admin/courses").then((r) => r.json()), fetch("/api/admin/course-folders").then((r) => r.json())])
      .then(([list, fd]) => {
        const folders = fd.folders || [];
        const byId = new Map(folders.map((f) => [f.id, f]));
        const pathOf = (id) => {
          const parts = [];
          for (let f = byId.get(id); f; f = f.parentId != null ? byId.get(f.parentId) : null) parts.unshift(f.name);
          return parts.join(" / ");
        };
        const groups = new Map();
        for (const c of Array.isArray(list) ? list : []) {
          const key = c.folderId != null && byId.has(c.folderId) ? pathOf(c.folderId) : "";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ slug: c.slug, title: c.title });
        }
        setCourseGroups(
          [...groups.entries()]
            .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "uk")))
            .map(([label, items]) => ({ label: label || "Без папки", items }))
        );
      })
      .catch(() => {});
  }, []);
  const courses = courseGroups.flatMap((g) => g.items);
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
          channels: { push: form.push, telegram: form.telegram },
        }),
      });
      const d = await res.json();
      setResult(res.ok ? `Надіслано: ${d.created} сповіщень · push: ${d.pushed} пристроїв · Telegram: ${d.telegram}` : d.error);
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
        Ручна розсилка в центр сповіщень, push на пристрої і Telegram. Нові курси, дедлайни та відзнаки розсилаються автоматично.
      </p>

      <form className="adm-card adm-bc-form" onSubmit={send}>
        <div className="adm-card-head">
          <h2>Нова розсилка</h2>
          <span className="admin-hint">Заголовок до 80 символів, текст до 500 — довше системні сповіщення обрізають</span>
        </div>
        <div className="adm-field-grid">
        <div className="admin-field admin-field-wide">
          <label className="admin-label" htmlFor="bcTitle">Заголовок</label>
          <input id="bcTitle" className="admin-input-flex" maxLength={80} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="admin-field admin-field-wide">
          <label className="admin-label" htmlFor="bcMessage">Текст</label>
          <textarea id="bcMessage" className="admin-textarea" maxLength={500} required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>
        <div className="admin-field admin-field-wide">
          <span className="admin-label">Посилання при кліку (необов’язково)</span>
          <div className="adm-link-row">
            <select
              className="admin-select"
              value={courses.some((c) => form.url === `/courses/${c.slug}`) ? form.url : ""}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            >
              <option value="">Курс…</option>
              {courseGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((c) => (
                    <option key={c.slug} value={`/courses/${c.slug}`}>
                      {c.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input className="admin-input-flex" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="або свій шлях: /hub/learn" />
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="bcTarget">Кому</label>
          <select id="bcTarget" className="admin-select" value={form.all ? "all" : "positions"} onChange={(e) => setForm({ ...form, all: e.target.value === "all" })}>
            <option value="all">Усім активним співробітникам</option>
            <option value="positions">За посадами</option>
          </select>
        </div>
        <div className="admin-field">
          <span className="admin-label">Канали</span>
          <div className="adm-bc-channels">
            <label className="admin-checkbox">
              <input type="checkbox" checked={form.push} onChange={(e) => setForm({ ...form, push: e.target.checked })} /> Push на пристрої
            </label>
            <label className="admin-checkbox">
              <input type="checkbox" checked={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.checked })} /> Telegram
            </label>
          </div>
        </div>
        </div>
        {!form.all && (
          <div className="admin-checkbox-grid">
            {positions.map((p) => (
              <label key={p.code} className="admin-checkbox">
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
        <div className="adm-card-foot">
          {result && <p className="admin-hint">{result}</p>}
          <button type="submit" className="admin-btn admin-btn-primary" disabled={sending || (!form.all && form.positionCodes.length === 0) || (!form.push && !form.telegram)}>
            {sending ? <SpinnerIcon /> : "Надіслати"}
          </button>
        </div>
      </form>

      <section className="adm-card" style={{ marginTop: 16 }}>
      <div className="adm-card-head">
        <h2>Історія</h2>
        {selected.size > 0 && (
          <button type="button" className="admin-btn admin-btn-danger" onClick={() => removeBroadcasts([...selected])} disabled={deleting}>
            {deleting && <SpinnerIcon />}
            Видалити обрані ({selected.size})
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <p className="admin-hint">Ще нічого не надсилали.</p>
      ) : (
        <table className="admin-table adm-bc-table">
          <thead>
            <tr>
              <th>
                <label className="adm-bc-selectall">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? new Set(history.map((b) => b.id)) : new Set())}
                  />
                  Виділити все
                </label>
              </th>
              <th>Коли</th>
              <th>Заголовок</th>
              <th>Кому</th>
              <th>Отримали</th>
              <th>Push</th>
              <th>Telegram</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.map((b) => (
              <tr key={b.id} className={selected.has(b.id) ? "is-selected" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Обрати «${b.title}»`}
                    checked={selected.has(b.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(b.id);
                        else next.delete(b.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td>{new Date(b.createdAt).toLocaleString("uk-UA")}</td>
                <td>
                  <b>{b.title}</b>
                  <div className="admin-hint">{b.message}</div>
                </td>
                <td>{b.targetSummary}</td>
                <td>{b.sentCount}</td>
                <td>{(b.channels || "push,telegram").includes("push") ? b.pushed : "—"}</td>
                <td>{(b.channels || "push,telegram").includes("telegram") ? b.telegramSent : "—"}</td>
                <td>
                  <button type="button" className="iconbtn iconbtn-danger" title="Видалити" aria-label="Видалити" onClick={() => removeBroadcasts([b.id])} disabled={deleting}>
                    <XIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </section>
      {children}
    </div>
  );
}
