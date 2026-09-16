"use client";

import { useEffect, useMemo, useState } from "react";
import { DESIGN_PRESETS, DESIGN_TOKENS, applyOverrides, defaultValues, matchPreset, readOverrides, toCss, writeOverrides, type TokenValues } from "@/lib/designTokens";
import { StatusBadge } from "@/components/StatusBadge";
import { CardSkeleton } from "@/components/Skeleton";
import { BellIcon, ChevronIcon, PencilIcon, PeopleIcon, ProfileIcon, SpinnerIcon, XIcon } from "@/components/icons";

/**
 * /admin/design — стенд дизайн-системи: ліворуч регулятори токенів
 * (lib/designTokens.ts), праворуч усі атоми застосунку на РЕАЛЬНОМУ CSS,
 * що міняються наживо. Регулятори — прев’ю в localStorage цього браузера
 * (DesignTokensOverride на всіх сторінках); «Зберегти для всіх» пише набір
 * в AppSetting (app/api/admin/design, лише супер-адмін) — кореневий layout
 * вставляє його як <style> для всіх. «Скопіювати :root» — щоб зафіксувати
 * обране і в tokens.css.
 */
export function DesignStand() {
  const defaults = useMemo(() => defaultValues(), []);
  const [values, setValues] = useState<TokenValues>(defaults);
  const [copied, setCopied] = useState(false);
  // Що збережено «для всіх» (AppSetting, lib/designSettings.ts): null —
  // дефолти tokens.css; undefined — ще не завантажено.
  const [saved, setSaved] = useState<{ values: TokenValues; updatedAt: string } | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const local = readOverrides();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues({ ...defaultValues(), ...local });
    fetch("/api/admin/design")
      .then((r) => r.json())
      .then((d) => {
        setSaved(d.saved ?? null);
        // Без локального прев’ю стартуємо з того, що збережено для всіх.
        if (Object.keys(local).length === 0 && d.saved) setValues({ ...defaultValues(), ...d.saved.values });
      })
      .catch(() => setSaved(null));
  }, []);

  async function saveForAll() {
    if (!window.confirm("Зберегти ці токени для всіх користувачів? Зміна з’явиться в усіх протягом хвилини.")) return;
    setSaving(true);
    setNotice("");
    try {
      const res = await fetch("/api/admin/design", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setSaved(d.saved);
      // Локальне прев’ю більше не потрібне: тепер це і є спільний стан.
      writeOverrides({});
      setNotice("Збережено для всіх");
    } catch (err) {
      setNotice("Помилка: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function resetForAll() {
    if (!window.confirm("Повернути всім дефолти з tokens.css?")) return;
    setSaving(true);
    setNotice("");
    try {
      const res = await fetch("/api/admin/design", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(null);
      setValues(defaults);
      applyOverrides({});
      writeOverrides({});
      setNotice("Для всіх повернуто дефолти");
    } catch (err) {
      setNotice("Помилка: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(key: string) {
    const p = DESIGN_PRESETS.find((x) => x.key === key);
    if (!p) return;
    const next = { ...defaults, ...p.values };
    setValues(next);
    applyOverrides(next);
    writeOverrides(next);
  }
  /** Взяти з системи лише одну групу токенів (напр. кнопки з iOS, картки з Fluent). */
  function applyPresetGroup(key: string, group: string) {
    const p = DESIGN_PRESETS.find((x) => x.key === key);
    if (!p) return;
    const next = { ...values };
    for (const t of DESIGN_TOKENS) if (t.group === group) next[t.key] = p.values[t.key] ?? defaults[t.key];
    setValues(next);
    applyOverrides(next);
    writeOverrides(next);
  }
  function update(key: string, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    applyOverrides(next);
    writeOverrides(next);
  }
  function reset() {
    setValues(defaults);
    applyOverrides({});
    writeOverrides({});
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(toCss(values));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Скопіюйте вручну:", toCss(values));
    }
  }

  const groups = Array.from(new Set(DESIGN_TOKENS.map((t) => t.group)));
  const activePreset = matchPreset(values);
  const changed = DESIGN_TOKENS.filter((t) => values[t.key] !== defaults[t.key]).length;
  const savedValues = saved ? { ...defaults, ...saved.values } : defaults;
  const differsFromSaved = DESIGN_TOKENS.some((t) => values[t.key] !== savedValues[t.key]);

  return (
    <div className="admin-page ds-page">
      <h1>Дизайн-система</h1>
      <p className="admin-subtitle">
        Кожен елемент праворуч — живий компонент застосунку. Регулятори міняють токени в цьому браузері одразу на всіх сторінках (прев’ю);
        «Зберегти для всіх» робить набір спільним для всіх користувачів без деплою. Кольори тут не змінюються.
      </p>

      <div className="ds-layout">
        <aside className="ds-controls">
          <section className="adm-card ds-group" role="radiogroup" aria-label="Готова система">
            <h2>Готова система</h2>
            {DESIGN_PRESETS.map((p) => (
              <label key={p.key} className={`ds-preset${activePreset === p.key ? " is-on" : ""}`}>
                <input type="radio" name="ds-preset" value={p.key} checked={activePreset === p.key} onChange={() => applyPreset(p.key)} />
                <span>
                  <b>{p.label}</b>
                  <small>{p.hint}</small>
                </span>
              </label>
            ))}
            {activePreset === null && <p className="admin-hint">Власні значення — підкручені після вибору системи.</p>}
          </section>
          {groups.map((g) => (
            <section key={g} className="adm-card ds-group">
              <div className="ds-group-head">
                <h2>{g}</h2>
                <select className="admin-select ds-group-preset" value="" aria-label={`Взяти «${g}» з системи`} onChange={(e) => e.target.value && applyPresetGroup(e.target.value, g)}>
                  <option value="">Взяти з…</option>
                  {DESIGN_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {DESIGN_TOKENS.filter((t) => t.group === g).map((t) => (
                <label key={t.key} className="ds-control">
                  <span className="ds-control-label">
                    {t.label}
                    <code>{values[t.key]}</code>
                  </span>
                  {t.kind === "px" ? (
                    <input
                      type="range"
                      min={t.min}
                      max={t.max}
                      step={t.step || 1}
                      value={parseFloat(values[t.key]) || t.def}
                      onChange={(e) => update(t.key, `${e.target.value}px`)}
                    />
                  ) : (
                    <select className="admin-select" value={values[t.key]} onChange={(e) => update(t.key, e.target.value)}>
                      {t.choices.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              ))}
            </section>
          ))}
          <div className="ds-actions">
            <button type="button" className="admin-btn" onClick={saveForAll} disabled={saving || saved === undefined || !differsFromSaved}>
              {saving ? <SpinnerIcon /> : null}
              Зберегти для всіх
            </button>
            <button type="button" className="admin-btn" onClick={reset} disabled={changed === 0}>
              Скинути прев’ю
            </button>
            <button type="button" className="admin-btn admin-btn-danger" onClick={resetForAll} disabled={saving || !saved}>
              Дефолти для всіх
            </button>
            <button type="button" className="admin-btn-link" onClick={copy}>
              {copied ? "Скопійовано" : "Скопіювати :root"}
            </button>
          </div>
          <p className="admin-hint">
            {saved === undefined
              ? "…"
              : saved
                ? `Для всіх збережено ${new Date(saved.updatedAt).toLocaleString("uk-UA")}${differsFromSaved ? " · прев’ю відрізняється" : ""}`
                : "Для всіх діють дефолти tokens.css"}
            {notice && ` · ${notice}`}
          </p>
          <pre className="ds-css">{toCss(values)}</pre>
        </aside>

        <div className="ds-preview">
          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Кнопки</h2>
              <span className="admin-hint">три розміри, одна форма</span>
            </div>
            <div className="ds-row">
              <button type="button" className="admin-btn">Мала</button>
              <button type="button" className="admin-btn admin-btn-primary">Мала основна</button>
              <button type="button" className="admin-btn admin-btn-danger">Небезпечна</button>
              <button type="button" className="admin-btn" disabled>Вимкнена</button>
              <button type="button" className="admin-btn-link">Посилання-кнопка</button>
            </div>
            <div className="ds-row">
              <a className="ct-enter-link ds-inline" href="#" onClick={(e) => e.preventDefault()}>
                Середня (картка курсу)
                <span className="ct-enter-chevron"><ChevronIcon /></span>
              </a>
              <button type="button" className="ct-certificate-link ds-inline">Сертифікат</button>
              <span className="reg-seg ds-inline">
                <button type="button" className="reg-seg-btn is-on"><ProfileIcon /> Співробітник</button>
                <button type="button" className="reg-seg-btn"><PeopleIcon /> Керівник</button>
              </span>
            </div>
            <div className="ds-row ds-row-phone">
              <button type="button" className="btn-primary-full">
                <span className="btn-label">Велика основна</span>
                <span className="btn-spinner" aria-hidden="true" />
              </button>
              <button type="button" className="btn-secondary-full">Велика другорядна</button>
              <button type="button" className="btn-primary-full is-busy">
                <span className="btn-label">Зайнята</span>
                <span className="btn-spinner" aria-hidden="true" />
              </button>
            </div>
            <div className="ds-row">
              <button type="button" className="iconbtn" aria-label="Редагувати"><PencilIcon /></button>
              <button type="button" className="iconbtn is-active" aria-label="Активна"><PeopleIcon /></button>
              <button type="button" className="iconbtn iconbtn-danger" aria-label="Видалити"><XIcon /></button>
              <button type="button" className="iconbtn iconbtn-bare" aria-label="Без рамки"><BellIcon /></button>
              <button type="button" className="admin-icon-btn" aria-label="Мала іконкова">×</button>
              <span className="adm-view-toggle">
                <button type="button" className="active" aria-label="Плитки"><PeopleIcon /></button>
                <button type="button" aria-label="Список"><BellIcon /></button>
              </span>
              <button type="button" className="admin-btn" disabled><SpinnerIcon /> Зачекайте</button>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Поля вводу</h2>
            </div>
            <div className="adm-field-grid">
              <div className="admin-field">
                <label className="admin-label">Текст</label>
                <input className="admin-input-flex" defaultValue="Значення" />
              </div>
              <div className="admin-field">
                <label className="admin-label">Вибір</label>
                <select className="admin-select" defaultValue="a">
                  <option value="a">Перший варіант</option>
                  <option value="b">Другий</option>
                </select>
              </div>
              <div className="admin-field admin-field-wide">
                <label className="admin-label">Багаторядкове</label>
                <textarea className="admin-textarea" rows={2} defaultValue="Текст повідомлення" />
                <span className="admin-hint">Підказка під полем</span>
              </div>
              <div className="admin-field">
                <label className="admin-checkbox">
                  <input type="checkbox" defaultChecked /> Чекбокс
                </label>
                <label className="admin-radio">
                  <input type="radio" name="ds-r" defaultChecked /> Радіо
                </label>
              </div>
              <div className="admin-field">
                <span className="admin-label">Перемикач</span>
                <label className="rt-switch">
                  <input type="checkbox" defaultChecked />
                  <span className="rt-switch-track" aria-hidden="true" />
                </label>
              </div>
              <div className="admin-field">
                <label className="admin-label">Помилка</label>
                <input className="admin-input-flex" defaultValue="" placeholder="Порожньо" />
                <p className="admin-error">Поле обов’язкове</p>
              </div>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Бейджі та статуси</h2>
              <span className="admin-hint">одна форма скрізь</span>
            </div>
            <div className="ds-row">
              <StatusBadge passed />
              <StatusBadge passed={false} />
              <StatusBadge passed icon>Залік · 92%</StatusBadge>
              <StatusBadge passed={false} icon>Незалік</StatusBadge>
              <span className="status-pill status-pill-neutral">Не розпочато</span>
              <span className="status-pill status-pill-alert">В процесі</span>
            </div>
            <div className="ds-row">
              <span className="adm-chip">Співробітник</span>
              <span className="adm-chip adm-chip-accent">Адмін</span>
              <span className="adm-chip adm-chip-off">деактивовано</span>
              <span className="territory-chip">Київ <button type="button">×</button></span>
              <span className="territory-chip territory-chip-person">Олена Коваль <button type="button">×</button></span>
              <span className="mgr-badge">3 курси</span>
              <span className="mgr-badge mgr-badge-score">92%</span>
              <span className="mgr-badge mgr-badge-overdue">2 прострочено</span>
              <span className="mgr-badge mgr-badge-success">Курс виконано</span>
            </div>
            <div className="ds-row">
              <span className="ct-tag">HoReCa</span>
              <span className="ct-tag ct-tag-new">Нове</span>
              <span className="ct-tag ct-tag-mandatory">Обов’язково</span>
              <span className="hub-sec-title ds-inline"><h3 style={{ margin: 0 }}>Обов’язково <span className="hub-sec-count">3</span></h3></span>
              <span className="ntf-bell ds-inline"><BellIcon /><span className="ntf-bell-count">4</span></span>
            </div>
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Таблиця</h2>
              <button type="button" className="admin-btn admin-btn-danger">Видалити обрані (1)</button>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th><label className="adm-bc-selectall"><input type="checkbox" /> Виділити все</label></th>
                  <th>Співробітник</th>
                  <th>Посада</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[
                  { n: "Олена Коваль", c: "MR0106", p: "Мерчендайзер", ok: true, sel: false },
                  { n: "Ігор Ткаченко", c: "TECH0071", p: "Технік", ok: false, sel: true },
                  { n: "Марія Шевчук", c: "SR0107", p: "Торговий представник", ok: true, sel: false },
                ].map((r) => (
                  <tr key={r.c} className={r.sel ? "is-selected" : undefined}>
                    <td><input type="checkbox" defaultChecked={r.sel} aria-label={r.n} /></td>
                    <td><b>{r.n}</b><div className="admin-hint">{r.c}</div></td>
                    <td>{r.p}</td>
                    <td><StatusBadge passed={r.ok} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="iconbtn" aria-label="Редагувати"><PencilIcon /></button>
                      <button type="button" className="iconbtn iconbtn-danger" aria-label="Видалити"><XIcon /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Картки</h2>
              <span className="admin-hint">compact / base / roomy від одного токена</span>
            </div>
            <div className="card-grid ds-cards">
              <div className="adm-card">
                <div className="adm-card-head"><h2>Картка адмінки</h2><span className="admin-hint">roomy</span></div>
                <p className="admin-hint">Текст усередині картки. Відступ — --card-pad-roomy.</p>
                <div className="adm-card-foot"><button type="button" className="admin-btn admin-btn-primary">Дія</button></div>
              </div>
              <div className="mgr-kpi-tile"><span>Виконано</span><b>78%</b></div>
              <div className="ntf-item unread">
                <span className="ntf-ico">📚</span>
                <div className="ntf-body"><div className="ntf-title">Вам призначено курс</div><div className="ntf-msg">«Робота із запереченнями»</div><div className="ntf-time">5 хв тому</div></div>
              </div>
              <div className="rt-card"><b>Без помилок</b><div className="admin-hint">Перше проходження на 100%</div></div>
              <div className="lb-row lb-row-self"><span className="lb-rank">1</span><span className="lb-name">Ви</span><span className="lb-score">980</span></div>
              <CardSkeleton />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
