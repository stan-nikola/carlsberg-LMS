"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/icons";

/**
 * /admin/rating — ваги подій рейтингу та пороги рівнів. Зміна ваги діє
 * на НОВІ нарахування; «Перерахувати все» стирає журнал і будує його
 * заново за поточними правилами (явна дія з підтвердженням). Бали за
 * конкретну відзнаку — в /admin/badges, за конкретний курс — у формі курсу.
 */
export function AdminRating() {
  const [rules, setRules] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalc, setRecalc] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/rating")
      .then((r) => r.json())
      .then((d) => {
        setRules(d.rules || []);
        setLevels(d.levels || []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/admin/rating", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules, levels }) });
    const d = await res.json();
    if (res.ok) {
      setRules(d.rules);
      setLevels(d.levels);
      setMsg("Збережено. Нові нарахування йдуть за цими вагами; для минулого — «Перерахувати все».");
    } else setMsg(d.error || "Помилка");
    setSaving(false);
  }

  async function recalculate() {
    if (!window.confirm("Стерти журнал балів усіх співробітників і перерахувати за поточними правилами? Дію не скасувати.")) return;
    setRecalc(true);
    const res = await fetch("/api/admin/rating/recalculate", { method: "POST" });
    const d = await res.json();
    setMsg(res.ok ? `Перераховано: ${d.events} нарахувань по ${d.enrollments} курсах і ${d.badges} відзнаках.` : d.error || "Помилка");
    setRecalc(false);
  }

  const updRule = (key, patch) => setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const updLevel = (i, patch) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  if (loading) return <div className="admin-page"><SpinnerIcon /></div>;

  return (
    <div className="admin-page">
      <h1>Рейтинг</h1>
      <p className="admin-subtitle">
        Бали нараховуються лише за перевірений результат: складений курс, 100%, перша спроба, вчасно, відзнаки. Штрафів немає — прострочення просто не дає бонусу «вчасно». Період — весь час.
      </p>

      <h2>Ваги подій</h2>
      <table className="admin-table">
        <thead>
          <tr><th>Подія</th><th>Бали</th><th>Увімкнено</th></tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.key}>
              <td>{r.label}<div className="admin-hint">{r.key}</div></td>
              <td><input type="number" min="0" className="admin-input-flex" style={{ maxWidth: 110 }} value={r.points} onChange={(e) => updRule(r.key, { points: e.target.value })} /></td>
              <td><input type="checkbox" checked={r.enabled !== false} onChange={(e) => updRule(r.key, { enabled: e.target.checked })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="admin-hint">Бали за конкретну відзнаку — у розділі «Ачивки», за конкретний курс — у формі курсу (поле «Бали рейтингу»).</p>

      <h2>Рівні</h2>
      <table className="admin-table">
        <thead>
          <tr><th>Від балів</th><th>Назва</th><th></th></tr>
        </thead>
        <tbody>
          {levels.map((l, i) => (
            <tr key={i}>
              <td><input type="number" min="0" className="admin-input-flex" style={{ maxWidth: 110 }} value={l.threshold} disabled={i === 0} onChange={(e) => updLevel(i, { threshold: e.target.value })} /></td>
              <td><input className="admin-input-flex" value={l.label} onChange={(e) => updLevel(i, { label: e.target.value })} /></td>
              <td>{i > 0 && <button type="button" className="admin-btn-link" onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))}>Прибрати</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="admin-row">
        <button type="button" className="admin-btn-link" onClick={() => setLevels((ls) => [...ls, { threshold: (Number(ls[ls.length - 1]?.threshold) || 0) + 500, label: "Новий рівень" }])}>+ Додати рівень</button>
      </div>

      <div className="admin-row" style={{ marginTop: 18 }}>
        <button type="button" className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>{saving ? <SpinnerIcon /> : "Зберегти"}</button>
        <button type="button" className="admin-btn admin-btn-danger" onClick={recalculate} disabled={recalc}>{recalc ? <SpinnerIcon /> : "Перерахувати все"}</button>
        {msg && <span className="admin-hint">{msg}</span>}
      </div>
    </div>
  );
}
