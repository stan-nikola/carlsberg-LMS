"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACCENT_GROUP,
  PERCEPTION_FIXES,
  PERCEPTION_GROUP,
  perceptionValues,
  readPerception,
  type PerceptionFix,
  DESIGN_PRESETS,
  DESIGN_TOKENS,
  applyOverrides,
  defaultValues,
  matchPreset,
  readOverrides,
  toCss,
  writeOverrides,
  type TokenValues,
} from "@/lib/designTokens";
import { ColorMap } from "@/components/ColorMap";
import { StatusBadge } from "@/components/StatusBadge";
import { CardSkeleton } from "@/components/Skeleton";
import { CompletionRing } from "@/components/CompletionRing";
import { BellIcon, CertificateIcon, ChevronIcon, CourseIcon, QuestionIcon, PencilIcon, PeopleIcon, ProfileIcon, SpinnerIcon, XIcon } from "@/components/icons";

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
    // Система міняє форму й розміри, а обрані акценти лишає.
    const accents = Object.fromEntries(DESIGN_TOKENS.filter((t) => t.group === ACCENT_GROUP || t.group === PERCEPTION_GROUP).map((t) => [t.key, values[t.key]]));
    const next = { ...defaults, ...p.values, ...accents };
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
  function setAccent(patch: TokenValues) {
    const next = { ...values, ...patch };
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

  const groups = Array.from(new Set(DESIGN_TOKENS.map((t) => t.group))).filter((g) => g !== ACCENT_GROUP);
  const activePreset = matchPreset(values);
  const changed = DESIGN_TOKENS.filter((t) => values[t.key] !== defaults[t.key]).length;
  const savedValues = saved ? { ...defaults, ...saved.values } : defaults;
  const differsFromSaved = DESIGN_TOKENS.some((t) => values[t.key] !== savedValues[t.key]);

  return (
    <div className="admin-page ds-page">
      <div className="adm-page-head">
        <div>
          <h1>Дизайн-система</h1>
          <p className="admin-subtitle">
            Кожен елемент праворуч — живий компонент застосунку. Регулятори міняють токени в цьому браузері одразу на всіх сторінках (прев’ю);
            «Зберегти для всіх» робить набір спільним для всіх користувачів без деплою. Кольори загалом не змінюються — лише кольори
            великих елементів хабу й кабінету керівника (сім вторинних кольорів Carlsberg Group).
          </p>
        </div>
      </div>

      <ColorMap values={values} onChange={setAccent} />

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
          <section className="adm-card ds-group">
            <h2>Сприйняття кольорів</h2>
            <p className="admin-hint">
              Рекомендації за WCAG і для дальтоніків — у межах палітри Malty: де колір погано читається, береться темніший відтінок того ж кольору.
              Ліворуч — як зараз, праворуч — як стане. Лише хаб, кабінет керівника й плеєр.
            </p>
            {PERCEPTION_FIXES.map((fix) => {
              const on = readPerception(fix.id, values);
              return (
                <div key={fix.id} className={`ds-fix${on ? " is-on" : ""}`}>
                  <label className="ds-fix-head">
                    <input type="checkbox" checked={on} onChange={(e) => setAccent(perceptionValues(fix.id, e.target.checked))} />
                    <span>
                      <small>{fix.area}</small>
                      <b>{fix.title}</b>
                    </span>
                  </label>
                  <p className="admin-hint">{fix.problem}</p>
                  <div className="ds-fix-compare">
                    {[false, true].map((rec) => (
                      <div key={String(rec)} className="ds-fix-side" style={perceptionValues(fix.id, rec) as React.CSSProperties & Record<string, string>}>
                        <span className="ds-fix-label">
                          {rec ? "Рекомендовано" : "Як зараз"}
                          {fix.contrast && <em className={(rec ? fix.contrast[1] : fix.contrast[0]) >= (fix.id === "input-border" ? 3 : 4.5) ? "is-ok" : "is-bad"}>{(rec ? fix.contrast[1] : fix.contrast[0]).toFixed(1)}:1</em>}
                        </span>
                        <PerceptionDemo id={fix.id} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
            <button type="button" className="admin-btn adm-btn-secondary" onClick={reset} disabled={changed === 0}>
              Скинути прев’ю
            </button>
            <button type="button" className="admin-btn adm-btn-danger" onClick={resetForAll} disabled={saving || !saved}>
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

        <div className="ds-preview adm-flow">
          <section className="adm-card adm-full">
            <div className="adm-card-head">
              <h2>Кольори елементів</h2>
              <span className="admin-hint">ті самі класи, що в хабі й кабінеті керівника</span>
            </div>
            <div className="ds-row ds-accent-demo">
              <span className="avatar avatar-md">ВЧ</span>
              <span className="avatar avatar-sm">ОС</span>
              <div className="badge-ico">🏆</div>
              <div className="badge-ico">🎯</div>
              <div className="course-tile ds-accent-tile"><span className="ct-icon"><CourseIcon /></span></div>
              <div className="profile-card ds-accent-hero">
                <span className="avatar avatar-md">SK</span>
              </div>
              <span className="settings-ico"><BellIcon /></span>
              <div className="profile-card ds-accent-hero">
                <span className="profile-level"><span className="lv-star">★</span> Профі</span>
              </div>
              <div className="cert-row"><span className="cert-ico"><CertificateIcon /></span><span className="cert-body"><b>Сертифікат</b></span></div>
              <span className="quiz-banner-ico"><QuestionIcon /></span>
            </div>
          </section>
          <section className="adm-card adm-full">
            <div className="adm-card-head">
              <h2>Кнопки</h2>
              <span className="admin-hint">три розміри, одна форма</span>
            </div>
            <div className="ds-row">
              <button type="button" className="admin-btn">Мала</button>
              <button type="button" className="admin-btn admin-btn-primary">Мала основна</button>
              <button type="button" className="admin-btn adm-btn-secondary">Другорядна</button>
              <button type="button" className="admin-btn adm-btn-danger">Руйнівна (розділи адмінки)</button>
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

          <section className="adm-card adm-wide">
            <div className="adm-card-head">
              <h2>Таблиця</h2>
              <button type="button" className="admin-btn admin-btn-danger">Видалити обрані (1)</button>
            </div>
            <div className="adm-table-wrap">
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
            </div>
          </section>

          <section className="adm-card adm-full">
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

          <section className="adm-card">
            <div className="adm-card-head">
              <h2>Діаграми</h2>
              <span className="admin-hint">кабінет керівника, прогрес курсу, рейтинг</span>
            </div>
            <div className="ds-charts">
              <div className="mgr-chart-card">
                <ul className="mgr-bar-list">
                  {[
                    { label: "до 10 хв", pct: 30, value: "6" },
                    { label: "10–20 хв", pct: 80, value: "17" },
                    { label: "20–40 хв", pct: 100, value: "21" },
                    { label: "понад 40 хв", pct: 0, value: "0" },
                  ].map((b) => (
                    <li key={b.label} className="mgr-bar-row">
                      <span className="mgr-bar-label">{b.label}</span>
                      <div className="mgr-bar-track">
                        <div className="mgr-bar-fill" style={{ width: `${b.pct}%` }} />
                      </div>
                      <span className="mgr-bar-value">{b.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Той самий CompletionRing, що й у керівника, а не схожа
                  копія — інакше прев’ю з часом розійдеться з реальністю.
                  0% поруч навмисно: на ньому видно, що заокруглений кінець
                  не лишає крапки там, де значення нульове. */}
              <div className="mgr-chart-card ds-ring-demo">
                <CompletionRing pct={82} label="З першої спроби" />
                <CompletionRing pct={0} label="Порожнє значення" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Живі елементи застосунку для порівняння «як зараз / рекомендовано» (реальні класи). */
function PerceptionDemo({ id }: { id: PerceptionFix }) {
  const seg = (cls: string, n: number) => (
    <div className="mgr-status-bar ds-fix-bar">
      <span className={`mgr-status-seg is-${cls}`} style={{ flexGrow: 1 }}>
        <span className="mgr-status-seg-count">{n}</span>
      </span>
    </div>
  );
  switch (id) {
    case "danger-text":
      return <span className="ct-due is-overdue">Прострочено на 2 дні</span>;
    case "accent-text":
      return <span className="ct-tag-new">Новий</span>;
    case "alert-pill":
      return <span className="status-pill status-pill-alert">Відстає</span>;
    case "fail-solid":
      return (
        <span className="ds-fix-row">
          {seg("overdue", 3)}
          <span className="mgr-matrix-cell is-overdue">!</span>
        </span>
      );
    case "info-solid":
      return <span className="mgr-matrix-cell is-in_progress">▸</span>;
    case "failed-amber":
      return (
        <span className="ds-fix-row">
          <span className="mgr-matrix-cell is-failed">✕</span>
          <span className="mgr-matrix-cell is-overdue">!</span>
        </span>
      );
    case "notstarted-grey":
      return seg("not_started", 2);
    case "inactive-hatch":
      return (
        <span className="ds-fix-row">
          {seg("overdue", 3)}
          {seg("inactive", 1)}
        </span>
      );
    case "glyphs":
      return (
        <span className="ds-fix-row">
          <span className="status-pill status-pill-success">Складено</span>
          <span className="status-pill status-pill-fail">Не складено</span>
        </span>
      );
    case "input-border":
      return <input className="mgr-team-search-input" placeholder="Пошук за ім’ям…" readOnly aria-label="Приклад поля пошуку" />;
  }
}
