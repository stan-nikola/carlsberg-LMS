"use client";

import { useEffect, useState } from "react";
import { SpinnerIcon } from "@/components/icons";

// Пояснення до кожного правила — адмін бачить, ЗА ЩО саме бали, а не
// лише технічний ключ.
const RULE_HINTS = {
  course_completed: "Базові бали за складений курс. Якщо в курсі задано власні бали — беруться вони.",
  course_perfect: "Бонус, коли курс складено рівно на 100%.",
  first_attempt: "Бонус, коли курс складено з першої спроби.",
  on_time: "Бонус, коли курс складено до дедлайну призначення.",
  manual_badge_default: "Бали за ручну відзнаку, якщо в самій відзнаці бали не задано.",
};

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
  const [dirty, setDirty] = useState(false);

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
      setDirty(false);
      setMsg("Збережено. Нові нарахування йдуть за цими вагами; щоб перерахувати минуле — «Перерахувати все» нижче.");
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

  const updRule = (key, patch) => {
    setDirty(true);
    setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const updLevel = (i, patch) => {
    setDirty(true);
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };
  const removeLevel = (i) => {
    setDirty(true);
    setLevels((ls) => ls.filter((_, j) => j !== i));
  };
  const addLevel = () => {
    setDirty(true);
    setLevels((ls) => [...ls, { threshold: (Number(ls[ls.length - 1]?.threshold) || 0) + 500, label: "Новий рівень" }]);
  };

  if (loading)
    return (
      <div className="admin-page">
        <p className="admin-subtitle">
          <SpinnerIcon /> Завантаження…
        </p>
      </div>
    );

  // Приклад для адміна: скільки дасть один курс за поточними вагами.
  const pts = (key) => {
    const r = rules.find((x) => x.key === key);
    return r && r.enabled !== false ? Number(r.points) || 0 : 0;
  };
  const maxPerCourse = pts("course_completed") + pts("course_perfect") + pts("first_attempt") + pts("on_time");

  return (
    <div className="admin-page rt-admin">
      <div className="adm-page-head">
        <div>
          <h1>Рейтинг</h1>
          <p className="admin-subtitle">
            Бали лише за перевірений результат: складений курс, 100%, перша спроба, вчасно, відзнаки. Штрафів немає — прострочення просто не дає бонусу «вчасно». Період — весь час.
          </p>
        </div>
      </div>

      <section className="rt-admin-section">
        <div className="rt-admin-section-head">
          <h2>Ваги подій</h2>
          <span className="admin-hint">Максимум за один курс зараз: <b>{maxPerCourse}</b> балів</span>
        </div>
        <div className="rt-rule-grid">
          {rules.map((r) => (
            <div key={r.key} className={`rt-rule-card${r.enabled === false ? " is-off" : ""}`}>
              <div className="rt-rule-top">
                <b>{r.label}</b>
                <label className="rt-switch" title={r.enabled === false ? "Вимкнено — бали не нараховуються" : "Увімкнено"}>
                  <input type="checkbox" checked={r.enabled !== false} onChange={(e) => updRule(r.key, { enabled: e.target.checked })} />
                  <span className="rt-switch-track" aria-hidden="true" />
                </label>
              </div>
              <p className="rt-rule-hint">{RULE_HINTS[r.key] || r.key}</p>
              <div className="rt-rule-points">
                <input type="number" min="0" className="admin-input-flex" value={r.points} disabled={r.enabled === false} onChange={(e) => updRule(r.key, { points: e.target.value })} aria-label={`Бали: ${r.label}`} />
                <span>балів</span>
              </div>
            </div>
          ))}
        </div>
        <p className="admin-hint">Бали за конкретну відзнаку — у розділі «Відзнаки та винагороди», за конкретний курс — у формі курсу (поле «Бали рейтингу»).</p>
      </section>

      <section className="rt-admin-section">
        <div className="rt-admin-section-head">
          <h2>Рівні</h2>
          <span className="admin-hint">Рівень визначається сумою балів; перший завжди від 0.</span>
        </div>
        <ol className="rt-level-ladder">
          {levels.map((l, i) => (
            <li key={i} className="rt-level-row">
              <span className="rt-level-step" aria-hidden="true">
                {i + 1}
              </span>
              <span className="rt-level-from">
                від
                <input type="number" min="0" className="admin-input-flex" value={l.threshold} disabled={i === 0} onChange={(e) => updLevel(i, { threshold: e.target.value })} aria-label="Поріг балів" />
                балів
              </span>
              <input className="admin-input-flex rt-level-name" value={l.label} onChange={(e) => updLevel(i, { label: e.target.value })} aria-label="Назва рівня" />
              {i > 0 ? (
                <button type="button" className="admin-btn-link admin-link-danger" onClick={() => removeLevel(i)}>
                  Прибрати
                </button>
              ) : (
                <span className="admin-hint">стартовий</span>
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="admin-btn-link" onClick={addLevel}>
          + Додати рівень
        </button>
      </section>

      <div className="rt-admin-actions">
        <button type="button" className="admin-btn admin-btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? <SpinnerIcon /> : "Зберегти зміни"}
        </button>
        {!dirty && !msg && <span className="admin-hint">Змін немає</span>}
        {msg && <span className="admin-hint">{msg}</span>}
      </div>

      <section className="rt-admin-section rt-admin-danger">
        <div className="rt-admin-section-head">
          <h2>Перерахунок</h2>
        </div>
        <p className="admin-hint">
          Ваги діють на нові нарахування. Щоб застосувати їх до всього, що вже пройдено, журнал стирається і будується заново за поточними правилами по всіх складених курсах і виданих відзнаках. Місця в рейтингу зміняться у всіх.
        </p>
        <button type="button" className="admin-btn admin-btn-danger" onClick={recalculate} disabled={recalc || dirty} title={dirty ? "Спершу збережіть зміни" : undefined}>
          {recalc ? <SpinnerIcon /> : "Перерахувати все"}
        </button>
      </section>
    </div>
  );
}
