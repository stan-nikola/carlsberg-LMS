"use client";

import { Fragment, createContext, useContext, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  ACCENT_ELEMENTS,
  ACCENT_EXTRA_IDS,
  ACCENT_FAMILIES,
  ACCENT_GROUPS,
  ACCENT_SHADES,
  NOW_ID,
  NOW_LABEL,
  STYLE_DESC,
  STYLE_LABEL,
  accentElement,
  accentTokenValues,
  allAccentValues,
  colorById,
  readAccent,
  type AccentElement,
  type AccentStyle,
} from "@/lib/accentPalette";
import { ACCENT_GUIDE, ACCENT_PRESETS, accentAdvice, accentVerdict, type AccentPick } from "@/lib/accentAdvice";
import { BellIcon, CertificateIcon, CourseIcon, QuestionIcon } from "@/components/icons";

type Values = Record<string, string>;

/** Які елементи видно на кожному екрані карти — і «де ще» в панелі елемента. */
const SCREENS: { key: string; label: string; els: AccentElement[] }[] = [
  {
    key: "team",
    label: "Команда",
    els: ["ring", "level", "hero-stats", "ring-chart", "avatar", "st-fail", "st-alert", "st-success", "st-info", "bar-chart", "sidenav", "bell", "tabbar", "nav-dot"],
  },
  { key: "courses", label: "Курси", els: ["course", "tag-new", "st-fail", "st-success", "bar-course", "btn", "tabbar", "nav-dot"] },
  { key: "achievements", label: "Досягнення", els: ["score", "level", "bar-xp", "badge", "cert", "avatar", "lb-self", "tabbar"] },
  { key: "player", label: "Плеєр курсу", els: ["bar-player", "quiz", "plan-line", "st-success", "st-alert", "st-info", "points-chip", "cert", "btn"] },
  { key: "settings", label: "Сповіщення", els: ["bell", "unread", "settings", "btn2", "tabbar"] },
];

/**
 * /admin/design → «Кольори елементів»: карта екранів. Ліворуч — макет
 * екрана на тих самих --accent-* токенах, що й застосунок (тож вибір тут =
 * вигляд там); клік по будь-якому елементу відкриває праворуч: що це, де ще
 * зустрічається, вигляд і колір. Нижче — увесь перелік за групами.
 */
export function ColorMap({ values, onChange }: { values: Values; onChange: (patch: Values) => void }) {
  const [screen, setScreen] = useState(SCREENS[0].key);
  const [sel, setSel] = useState<AccentElement>("avatar");
  const pick: AccentPick = Object.fromEntries(ACCENT_ELEMENTS.map((e) => [e.id, readAccent(e.id, values)]));
  const advice = accentAdvice(pick);
  // Макет — всередині .adm-shell, який повертає статуси «як були» для адмінки;
  // тут обрані значення ставляться inline поверх.
  const tokens = Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith("accent-")).map(([k, v]) => [`--${k}`, v])) as CSSProperties;
  const scr = SCREENS.find((s) => s.key === screen)!;

  const select = (id: AccentElement) => {
    setSel(id);
    if (!scr.els.includes(id)) {
      const other = SCREENS.find((s) => s.els.includes(id));
      if (other) setScreen(other.key);
    }
  };
  const onMockClick = (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-el]");
    if (t?.dataset.el) {
      e.preventDefault();
      setSel(t.dataset.el as AccentElement);
    }
  };
  return (
    <section className="adm-card adm-full cm" style={tokens}>
      <div className="adm-card-head">
        <h2>Кольори елементів</h2>
        <span className="admin-hint">натисніть на будь-який елемент макета — праворуч з’явиться, що це і як його змінити</span>
      </div>

      <div className="cm-top">
        <div className="cm-screens" role="tablist" aria-label="Екран">
          {SCREENS.map((s) => (
            <button key={s.key} type="button" role="tab" aria-selected={screen === s.key} className={`cm-screen-tab${screen === s.key ? " is-on" : ""}`} onClick={() => setScreen(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="cm-quick">
          <span className="admin-hint">Готові гами (лише великі елементи):</span>
          {ACCENT_PRESETS.map((p) => {
            const on = Object.entries(p.colors).every(([id, c]) => pick[id]?.color === c);
            return (
              <button
                key={p.key}
                type="button"
                className={`cm-chip${on ? " is-on" : ""}`}
                aria-pressed={on}
                title={p.why}
                onClick={() =>
                  onChange(Object.assign({}, ...Object.entries(p.colors).map(([id, c]) => accentTokenValues(id as AccentElement, c, pick[id]?.style ?? accentElement(id).pick.style))))
                }
              >
                <span className="cm-chip-dots">
                  {[...new Set(Object.values(p.colors))].slice(0, 3).map((c) => (
                    <i key={c} style={{ background: colorById(c)?.hex }} />
                  ))}
                </span>
                {p.label}
              </button>
            );
          })}
          <span className="cm-same">
            <span className="admin-hint">Усі однаково:</span>
            {ACCENT_FAMILIES.map((f) => (
              <button key={f.fam} type="button" className="cm-dot" title={`Усі великі елементи — ${f.label}`} style={{ background: f.hex }} onClick={() => onChange(allAccentValues(`${f.fam}-main`, values))} />
            ))}
          </span>
        </div>
      </div>

      <div className="cm-body">
        <div className="cm-phone" onClick={onMockClick}>
          <SelContext.Provider value={sel}>
          {screen === "team" && <TeamMock />}
          {screen === "courses" && <CoursesMock />}
          {screen === "achievements" && <AchievementsMock />}
          {screen === "player" && <PlayerMock />}
          {screen === "settings" && <SettingsMock />}
          </SelContext.Provider>
        </div>
        <ElementPanel id={sel} values={values} pick={pick} warnings={advice[sel] ?? []} onChange={onChange} />
      </div>

      <div className="cm-all">
        {ACCENT_GROUPS.map((g) => (
          <div key={g.key} className="cm-group">
            <h3>{g.label}</h3>
            <div className="cm-group-list">
              {ACCENT_ELEMENTS.filter((e) => e.group === g.key).map((e) => {
                const cur = pick[e.id];
                return (
                  <button key={e.id} type="button" className={`cm-el${sel === e.id ? " is-on" : ""}`} onClick={() => select(e.id)}>
                    <AccentSample id={e.id} tokens={values} />
                    <span>
                      <b>{e.label}</b>
                      <small>{choiceLabel(cur)}</small>
                    </span>
                    {advice[e.id] && (
                      <span className="cm-warn-dot" title={advice[e.id].join(" ")}>
                        ⚠
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function choiceLabel(cur: { color: string; style: AccentStyle | null } | null | undefined) {
  if (!cur) return "власне значення";
  if (cur.color === NOW_ID) return NOW_LABEL;
  return `${colorById(cur.color)?.label ?? cur.color}${cur.style ? " · " + STYLE_LABEL[cur.style] : ""}`;
}

/** Панель обраного елемента: що це, де, вигляд, колір, підказки. */
function ElementPanel({ id, values, pick, warnings, onChange }: { id: AccentElement; values: Values; pick: AccentPick; warnings: string[]; onChange: (patch: Values) => void }) {
  const el = accentElement(id);
  const cur = pick[id];
  const isNow = cur?.color === NOW_ID;
  // «Як зараз» не має вигляду — плитки кольорів показуємо в першому вигляді елемента.
  const style: AccentStyle | null = (isNow ? null : cur?.style) ?? el.styles[0] ?? null;
  const color = isNow || !cur ? (el.pick.color === NOW_ID ? "brand-green" : el.pick.color) : cur.color;
  const where = SCREENS.filter((s) => s.els.includes(id)).map((s) => s.label);
  const tile = (colorId: string) => {
    const t = accentTokenValues(id, colorId, style);
    const v = accentVerdict(id, { color: colorId, style }, pick);
    const on = !isNow && cur?.color === colorId;
    const label = colorById(colorId)?.label ?? colorId;
    return (
      <button
        key={colorId}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={label}
        title={`${label} — ${v.reasons.join(" ")}`}
        className={`ds-acc-tile is-${v.level}${on ? " is-on" : ""}`}
        style={{ "--raw": colorById(colorId)?.hex } as CSSProperties}
        onClick={() => onChange(t)}
      >
        <AccentSample id={id} tokens={t} />
      </button>
    );
  };
  return (
    <div className="cm-panel">
      <div className="cm-now">
        <span className="cm-now-pic">
          <AccentSample id={id} tokens={values} big />
        </span>
        <div>
          <b>{el.label}</b>
          <small>Обрано: {choiceLabel(cur)}</small>
        </div>
      </div>
      <dl className="cm-facts">
        <dt>Що це</dt>
        <dd>{el.hint}</dd>
        {where.length > 0 && (
          <>
            <dt>На екранах</dt>
            <dd>{where.join(", ")}</dd>
          </>
        )}
        {ACCENT_GUIDE[id] && (
          <>
            <dt>Порада</dt>
            <dd>{ACCENT_GUIDE[id].how}</dd>
          </>
        )}
      </dl>
      {el.styles.length > 1 && (
        <>
          <span className="ds-control-label">1 · Вигляд</span>
          <div className="ds-acc-looks" role="radiogroup" aria-label="Вигляд">
            {el.styles.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={!isNow && style === s}
                className={`ds-acc-look${!isNow && style === s ? " is-on" : ""}`}
                title={STYLE_DESC[s]}
                onClick={() => onChange(accentTokenValues(id, color, s))}
              >
                <AccentSample id={id} tokens={accentTokenValues(id, color, s)} />
                {STYLE_LABEL[s]}
              </button>
            ))}
          </div>
          {style && <p className="admin-hint cm-style-desc">{STYLE_DESC[style]}</p>}
        </>
      )}
      <span className="ds-control-label">
        {el.styles.length > 1 ? "2 · Колір" : "Колір"}
        {style && el.styles.length > 1 && <small>плитки показано у вигляді «{STYLE_LABEL[style]}»; колір і вигляд незалежні</small>}
      </span>
      {el.now && (
        <button type="button" className={`cm-now-btn${isNow ? " is-on" : ""}`} aria-pressed={isNow} onClick={() => onChange(accentTokenValues(id, NOW_ID, null))}>
          <AccentSample id={id} tokens={accentTokenValues(id, NOW_ID, null)} />
          {NOW_LABEL} — як було до налаштування
        </button>
      )}
      <div className="ds-acc-grid" role="radiogroup" aria-label="Колір">
        <span />
        {ACCENT_SHADES.map((s) => (
          <small key={s.key}>{s.label}</small>
        ))}
        {ACCENT_FAMILIES.map((f) => (
          <Fragment key={f.fam}>
            <small>{f.label}</small>
            {ACCENT_SHADES.map((s) => tile(`${f.fam}-${s.key}`))}
          </Fragment>
        ))}
        <small>Бренд і сірі</small>
        <div className="ds-acc-extra">{ACCENT_EXTRA_IDS.map((c) => tile(c))}</div>
      </div>
      <p className="admin-hint">★ пасує за змістом · ⚠ є підказка (обрати можна)</p>
      {warnings.map((w) => (
        <p key={w} className="ds-accent-warn">
          {w}
        </p>
      ))}
      {!(el.now ? isNow : cur?.color === el.pick.color && cur?.style === el.pick.style) && (
        <button type="button" className="admin-btn-link" onClick={() => onChange(accentTokenValues(id, el.pick.color, el.pick.style))}>
          Повернути як у коді
        </button>
      )}
    </div>
  );
}

/** Мініатюра елемента в заданих токенах — у переліку, на плитках вигляду й кольору. */
export function AccentSample({ id, tokens, big = false }: { id: AccentElement; tokens: Values; big?: boolean }) {
  const k = `accent-${id}`;
  const el = accentElement(id);
  const cls = `ds-acc-sample${big ? " is-big" : ""}`;
  if (id === "ring") return <span className={`${cls} is-ring`} style={{ borderColor: tokens[k] }} />;
  if (id === "score") return <span className={`${cls} is-text`} style={{ color: tokens[k] }}>№1</span>;
  if (id === "nav-dot") return <span className={`${cls} is-dotbox`}><i style={{ background: tokens[k] }} /></span>;
  if (id === "plan-line" || id === "ring-chart") return <span className={`${cls} is-line`} style={{ background: tokens[k] }} />;
  if (!el.styles.length) return <span className={`${cls} is-bar`}><i style={{ background: tokens[k] }} /></span>;
  const face = { background: tokens[`${k}-bg`], color: tokens[`${k}-fg`], borderColor: tokens[`${k}-bd`] };
  if (el.group === "status")
    return (
      <span className={`${cls} is-status`}>
        <i style={{ background: tokens[k] }} />
        <em style={face}>Aa</em>
      </span>
    );
  const round = ["avatar", "badge", "level", "quiz", "bell"].includes(id);
  const inner =
    id === "avatar" ? "ВЧ"
    : id === "badge" ? "🏆"
    : id === "level" ? "★"
    : id === "course" ? <CourseIcon />
    : id === "cert" ? <CertificateIcon />
    : id === "quiz" ? <QuestionIcon />
    : id === "settings" ? <BellIcon />
    : id === "bell" ? "3"
    : id === "points-chip" ? "+50"
    : id === "tag-new" ? "Новий"
    : "Aa";
  const wide = ["btn", "btn2", "tag-new", "points-chip", "tabbar", "sidenav", "unread", "lb-self", "hero-stats"].includes(id);
  return (
    <span className={`${cls}${round ? " is-round" : ""}${wide ? " is-wide" : ""}${id === "hero-stats" ? " on-hero" : ""}`} style={face}>
      {inner}
    </span>
  );
}

/* ---- Макети екранів: розмітка-імітація на тих самих --accent-* токенах ---- */
const SelContext = createContext<string>("");
/** Елемент макета, по якому можна клікнути (обраний — з обвідкою). */
function H({ id, className = "", style, children }: { id: AccentElement; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const sel = useContext(SelContext);
  return (
    <span data-el={id} className={`cm-hot ${className}${sel === id ? " is-sel" : ""}`} style={style} title={accentElement(id).label}>
      {children}
    </span>
  );
}
const v = (name: string) => `var(--accent-${name})`;

function Hero({ stats }: { stats?: boolean }) {
  return (
    <div className="cm-hero">
      <H id="ring" className="cm-photo" style={{ borderColor: v("ring") }} />
      <div className="cm-hero-txt">
        <b>Stanislav Karmanov</b>
        <span className="cm-lvl">
          <H id="level" className="cm-star" style={{ background: v("level-bg"), color: v("level-fg") }}>
            ★
          </H>
          Профі
        </span>
      </div>
      {stats && (
        <div className="cm-plates">
          {["2 350", "№ 1", "6"].map((n) => (
            <H key={n} id="hero-stats" className="cm-plate" style={{ background: v("hero-stats-bg"), color: v("hero-stats-fg") }}>
              {n}
            </H>
          ))}
        </div>
      )}
    </div>
  );
}
function TabBar({ active }: { active: number }) {
  return (
    <div className="cm-tabbar">
      {["⌂", "▤", "☆", "◯"].map((g, i) =>
        i === active ? (
          <H key={g} id="tabbar" className="cm-tab is-on" style={{ background: v("tabbar-bg"), color: v("tabbar-fg") }}>
            {g}
          </H>
        ) : (
          <span key={g} className="cm-tab">
            {g}
            {i === 1 && <H id="nav-dot" className="cm-navdot" style={{ background: v("nav-dot") }} />}
          </span>
        )
      )}
    </div>
  );
}
const pill = (st: AccentElement, text: string) => (
  <H id={st} className="cm-pill" style={{ background: v(`${st}-bg`), color: v(`${st}-fg`) }}>
    {text}
  </H>
);
const solid = (st: AccentElement, text: string, flex = 1) => (
  <H id={st} className="cm-seg" style={{ background: v(st), color: v(`${st}-on`), flex }}>
    {text}
  </H>
);
const ava = (t: string) => (
  <H id="avatar" className="cm-ava" style={{ background: v("avatar-bg"), color: v("avatar-fg"), borderColor: v("avatar-bd") }}>
    {t}
  </H>
);

function TeamMock() {
  return (
    <>
      <div className="cm-appbar">
        <span className="cm-side">
          <H id="sidenav" className="cm-sidenav" style={{ background: v("sidenav-bg"), color: v("sidenav-fg"), borderColor: v("sidenav-bd") }}>
            ⌂ Команда
          </H>
          <span>Курси</span>
        </span>
        <span className="cm-bell">
          🔔
          <H id="bell" className="cm-count" style={{ background: v("bell-bg"), color: v("bell-fg") }}>
            3
          </H>
        </span>
      </div>
      <Hero stats />
      <div className="cm-card">
        <span className="cm-t">Показники команди</span>
        <div className="cm-rings">
          {[
            [72, "var(--cb-success)", "Виконано"],
            [40, v("ring-chart"), "З першої спроби"],
          ].map(([p, c, l], i) => (
            <span key={String(l)} className="cm-ring-wrap">
              {i === 1 ? (
                <H id="ring-chart" className="cm-ring">
                  <Ring p={Number(p)} c={String(c)} />
                </H>
              ) : (
                <span className="cm-ring">
                  <Ring p={Number(p)} c={String(c)} />
                </span>
              )}
              <small>{l}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="cm-card">
        <span className="cm-t">Потребують уваги</span>
        <div className="cm-row">
          {ava("ВЧ")}Вікторія{pill("st-fail", "Прострочено")}
        </div>
        <div className="cm-row">
          {ava("ОС")}Олег{pill("st-alert", "Відстає")}
        </div>
      </div>
      <div className="cm-card">
        <span className="cm-t">Стан команди</span>
        <div className="cm-bar">
          {solid("st-success", "4", 4)}
          {solid("st-alert", "2", 2)}
          {solid("st-fail", "1", 1)}
        </div>
        <span className="cm-t">Матриця</span>
        <div className="cm-cells">
          {solid("st-success", "✓")}
          {solid("st-info", "▸")}
          {solid("st-alert", "⏱")}
          {solid("st-fail", "!")}
        </div>
      </div>
      <div className="cm-card">
        <span className="cm-t">% складання по курсу</span>
        {[80, 55, 30].map((w) => (
          <span key={w} className="cm-track">
            <H id="bar-chart" className="cm-fill" style={{ width: `${w}%`, background: v("bar-chart") }} />
          </span>
        ))}
      </div>
      <TabBar active={0} />
    </>
  );
}
function Ring({ p, c }: { p: number; c: string }) {
  return (
    <svg viewBox="0 0 36 36" width="44" height="44" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle cx="18" cy="18" r="15" fill="none" style={{ stroke: c }} strokeWidth="4" strokeDasharray={`${(p / 100) * 94.2} 94.2`} transform="rotate(-90 18 18)" strokeLinecap="round" />
    </svg>
  );
}
function CoursesMock() {
  return (
    <>
      <div className="cm-card">
        <div className="cm-row">
          <H id="course" className="cm-cico" style={{ background: v("course-bg"), color: v("course-fg"), borderColor: v("course-bd") }}>
            <CourseIcon />
          </H>
          <b>Механіка 15</b>
          <H id="tag-new" className="cm-tag" style={{ background: v("tag-new-bg"), color: v("tag-new-fg"), borderColor: v("tag-new-bd") }}>
            Новий
          </H>
        </div>
        <H id="st-fail" className="cm-due" style={{ color: v("st-fail-text") }}>
          Прострочено на 2 дні
        </H>
        <span className="cm-track">
          <H id="bar-course" className="cm-fill" style={{ width: "40%", background: v("bar-course") }} />
        </span>
        <H id="btn" className="cm-btn" style={{ background: v("btn-bg"), color: v("btn-fg") }}>
          Почати курс
        </H>
      </div>
      <div className="cm-card">
        <div className="cm-row">
          <H id="course" className="cm-cico" style={{ background: v("course-bg"), color: v("course-fg"), borderColor: v("course-bd") }}>
            <CourseIcon />
          </H>
          <b>Стилі пива</b>
          {pill("st-success", "Складено")}
        </div>
        <span className="cm-track">
          <H id="bar-course" className="cm-fill" style={{ width: "100%", background: v("bar-course") }} />
        </span>
      </div>
      <TabBar active={1} />
    </>
  );
}
function AchievementsMock() {
  return (
    <>
      <div className="cm-card">
        <span className="cm-t">Мій прогрес</span>
        <div className="cm-row cm-between">
          <H id="score" className="cm-big" style={{ color: v("score") }}>
            2 350 балів
          </H>
          <H id="score" className="cm-big" style={{ color: v("score") }}>
            № 1
          </H>
        </div>
        <span className="cm-lvl is-light">
          <H id="level" className="cm-star" style={{ background: v("level-bg"), color: v("level-fg") }}>
            ★
          </H>
          Рівень: Профі
        </span>
        <span className="cm-track">
          <H id="bar-xp" className="cm-fill" style={{ width: "70%", background: v("bar-xp") }} />
        </span>
      </div>
      <div className="cm-card">
        <span className="cm-t">Відзнаки</span>
        <div className="cm-row cm-around">
          {["🏆", "⭐", "🎯"].map((e) => (
            <H key={e} id="badge" className="cm-badge" style={{ background: v("badge-bg"), color: v("badge-fg"), boxShadow: `inset 0 0 0 1px ${v("badge-bd")}` }}>
              {e}
            </H>
          ))}
        </div>
        <span className="cm-t">Сертифікати</span>
        <H id="cert" className="cm-cert" style={{ background: v("cert-bg"), color: v("cert-fg"), borderColor: v("cert-bd") }}>
          <CertificateIcon /> Стилі пива · 100%
        </H>
      </div>
      <div className="cm-card">
        <span className="cm-t">Лідери</span>
        <H id="lb-self" className="cm-lb" style={{ background: v("lb-self-bg"), borderColor: v("lb-self-bd") }}>
          1 {ava("SK")} Я
          <H id="score" className="cm-lb-score" style={{ color: v("score") }}>
            2 350
          </H>
        </H>
        <span className="cm-lb">
          2 {ava("ОС")} Олег
          <H id="score" className="cm-lb-score" style={{ color: v("score") }}>
            1 900
          </H>
        </span>
      </div>
      <TabBar active={2} />
    </>
  );
}
function PlayerMock() {
  return (
    <>
      <span className="cm-track">
        <H id="bar-player" className="cm-fill" style={{ width: "55%", background: v("bar-player") }} />
      </span>
      <div className="cm-card cm-row">
        <H id="quiz" className="cm-quiz" style={{ background: v("quiz-bg"), color: v("quiz-fg"), borderColor: v("quiz-bd") }}>
          <QuestionIcon />
        </H>
        <b>Перевірте себе</b>
      </div>
      <div className="cm-card">
        <span className="cm-t">План курсу</span>
        <div className="cm-plan">
          <H id="plan-line" className="cm-plan-line" style={{ background: v("plan-line") }} />
          {(["st-success", "st-success", "st-alert", "st-info"] as AccentElement[]).map((st, i) => (
            <H key={i} id={st} className="cm-plan-dot" style={{ background: v(st) }}>
              {i + 1}
            </H>
          ))}
        </div>
      </div>
      <div className="cm-card cm-center">
        <b>Курс складено!</b>
        <H id="points-chip" className="cm-chip-pts" style={{ background: v("points-chip-bg"), color: v("points-chip-fg") }}>
          +50 балів
        </H>
        <H id="cert" className="cm-cert" style={{ background: v("cert-bg"), color: v("cert-fg"), borderColor: v("cert-bd") }}>
          <CertificateIcon /> Сертифікат
        </H>
        <H id="btn" className="cm-btn" style={{ background: v("btn-bg"), color: v("btn-fg") }}>
          Завантажити PDF
        </H>
      </div>
    </>
  );
}
function SettingsMock() {
  return (
    <>
      <div className="cm-appbar">
        <b>Сповіщення</b>
        <span className="cm-bell">
          🔔
          <H id="bell" className="cm-count" style={{ background: v("bell-bg"), color: v("bell-fg") }}>
            2
          </H>
        </span>
      </div>
      <H id="unread" className="cm-ntf" style={{ background: v("unread-bg"), borderColor: v("unread-bd") }}>
        Вам призначено курс «Механіка 15»
      </H>
      <span className="cm-ntf">Курс «Стилі пива» складено</span>
      <div className="cm-card">
        {["Сповіщення", "Розмір тексту"].map((t) => (
          <div key={t} className="cm-row">
            <H id="settings" className="cm-set" style={{ background: v("settings-bg"), color: v("settings-fg"), borderColor: v("settings-bd") }}>
              <BellIcon />
            </H>
            {t}
          </div>
        ))}
        <H id="btn2" className="cm-btn" style={{ background: v("btn2-bg"), color: v("btn2-fg"), border: `var(--border-w) solid ${v("btn2-bd")}` }}>
          Налаштувати
        </H>
      </div>
      <TabBar active={3} />
    </>
  );
}
