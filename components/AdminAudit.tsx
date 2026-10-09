"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExcelIcon, SpinnerIcon, XIcon } from "@/components/icons";
import { AUDIT_ACTION_LABELS as ACTION_LABELS, AUDIT_CATEGORIES as CATEGORIES, AUDIT_ROLE_LABELS, describeAuditEntry as describe } from "@/lib/auditFormat";
import { LoadingLine } from "@/components/Skeleton";

type Person = { id: number; name: string; externalCode?: string | null; position?: string | null };
type Entry = {
  id: number;
  createdAt: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: number | null;
  details: Record<string, unknown> | null;
  person: Person | null;
  target: { label: string; href?: string } | null;
};
type Page = { entries: Entry[]; nextCursor: number | null; retentionDays: number; canEditRetention: boolean };

const ROLE_CLASS: Record<string, string> = {
  super: "status-pill audit-role-super",
  admin: "status-pill status-pill-success",
  manager: "status-pill status-pill-alert",
  employee: "status-pill",
  system: "status-pill",
};
const ROLES = Object.fromEntries(
  Object.entries(AUDIT_ROLE_LABELS).map(([k, label]) => [k, { label, className: ROLE_CLASS[k] || "status-pill" }])
) as Record<string, { label: string; className: string }>;

// ------------------------------------------------------------ таблиця-сітка

/**
 * Колонки журналу. Ширини — як у Excel: тягнути за правий край заголовка,
 * подвійний клік — повернути стандартну. Запам'ятовуються в localStorage
 * (лише зручність одного адміна, не дані).
 */
const COLUMNS = [
  { key: "when", label: "Коли", width: 132 },
  { key: "who", label: "Хто", width: 230 },
  { key: "action", label: "Дія", width: 190 },
  { key: "target", label: "Об'єкт", width: 210 },
  { key: "describe", label: "Розбір", width: 460 },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];
const ROW_HEADER_WIDTH = 44;
const MIN_COL = 70;
const MIN_ROW = 28;
const WIDTHS_KEY = "audit-grid-widths-v1";

function defaultWidths(): Record<ColumnKey, number> {
  return Object.fromEntries(COLUMNS.map((c) => [c.key, c.width])) as Record<ColumnKey, number>;
}

/** Тягнути мишею чи пальцем: dx/dy від точки натискання, поки кнопку не відпущено. */
function startDrag(e: React.PointerEvent, onMove: (dx: number, dy: number) => void) {
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const y0 = e.clientY;
  const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.classList.remove("audit-resizing");
  };
  document.body.classList.add("audit-resizing");
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function AuditGrid({ entries, onPerson }: { entries: Entry[]; onPerson: (p: Person) => void }) {
  const [widths, setWidths] = useState<Record<ColumnKey, number>>(defaultWidths);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [open, setOpen] = useState<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) || "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && typeof saved === "object") setWidths((w) => ({ ...w, ...saved }));
    } catch {
      // приватний режим чи зіпсований запис — стандартні ширини
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths));
    } catch {
      // не критично
    }
  }, [widths]);

  const resizeColumn = (key: ColumnKey) => (e: React.PointerEvent) => {
    const start = widths[key];
    startDrag(e, (dx) => setWidths((w) => ({ ...w, [key]: Math.max(MIN_COL, Math.round(start + dx)) })));
  };
  const resizeRow = (id: number) => (e: React.PointerEvent) => {
    const row = (e.currentTarget as HTMLElement).closest("tr");
    const start = row?.getBoundingClientRect().height ?? 40;
    startDrag(e, (_dx, dy) => setHeights((h) => ({ ...h, [id]: Math.max(MIN_ROW, Math.round(start + dy)) })));
  };
  const resetRow = (id: number) =>
    setHeights((h) => {
      const next = { ...h };
      delete next[id];
      return next;
    });

  const total = ROW_HEADER_WIDTH + COLUMNS.reduce((sum, c) => sum + widths[c.key], 0);

  return (
    <div className="adm-table-wrap is-tall audit-grid-wrap">
      <table className="audit-grid" style={{ width: total }}>
        <colgroup>
          <col style={{ width: ROW_HEADER_WIDTH }} />
          {COLUMNS.map((c) => (
            <col key={c.key} style={{ width: widths[c.key] }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="audit-grid-corner" aria-label="№" />
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
                <span
                  className="audit-col-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Ширина колонки «${c.label}»`}
                  title="Тягніть, щоб змінити ширину; подвійний клік — стандартна"
                  onPointerDown={resizeColumn(c.key)}
                  onDoubleClick={() => setWidths((w) => ({ ...w, [c.key]: c.width }))}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const role = ROLES[e.actor] || { label: e.actor, className: "status-pill" };
            const when = formatWhen(e.createdAt);
            const h = heights[e.id];
            // Задана висота — вміст обрізається по ній (як у Excel), інакше рядок по вмісту.
            const cell = (content: React.ReactNode) =>
              h ? (
                <div className="audit-cell" style={{ maxHeight: Math.max(0, h - 13) }}>
                  {content}
                </div>
              ) : (
                content
              );
            return (
              <tr key={e.id} style={h ? { height: h } : undefined}>
                <th scope="row" className="audit-row-head">
                  {i + 1}
                  <span
                    className="audit-row-handle"
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label={`Висота рядка ${i + 1}`}
                    title="Тягніть, щоб змінити висоту; подвійний клік — авто"
                    onPointerDown={resizeRow(e.id)}
                    onDoubleClick={() => resetRow(e.id)}
                  />
                </th>
                <td className="audit-when">
                  {cell(
                    <>
                      <span>{when.date}</span>
                      <span className="admin-employee-meta">{when.time}</span>
                    </>
                  )}
                </td>
                <td>
                  {cell(
                    <div className="audit-who">
                      <span className={role.className}>{role.label}</span>
                      {e.person && (
                        <>
                          <button type="button" className="audit-person" onClick={() => onPerson(e.person!)} title="Лише дії цієї людини">
                            {e.person.name}
                          </button>
                          <span className="admin-employee-meta">
                            {[e.person.position, e.person.externalCode].filter(Boolean).join(" · ")}{" "}
                            <Link href={`/admin/employees/${e.person.id}`} className="audit-card-link">
                              картка
                            </Link>
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td>{cell(<b className="audit-action">{ACTION_LABELS[e.action] || e.action}</b>)}</td>
                <td>
                  {cell(
                    e.target ? (
                      e.target.href ? (
                        <Link href={e.target.href}>{e.target.label}</Link>
                      ) : (
                        e.target.label
                      )
                    ) : e.targetId != null ? (
                      `#${e.targetId}`
                    ) : (
                      "—"
                    )
                  )}
                </td>
                <td>
                  {cell(
                    <>
                      <span className="audit-describe">{describe(e) || "—"}</span>
                      {e.details && (
                        <button type="button" className="audit-raw-toggle" onClick={() => setOpen(open === e.id ? null : e.id)}>
                          {open === e.id ? "сховати дані" : "дані"}
                        </button>
                      )}
                      {open === e.id && <pre className="admin-audit-details open">{JSON.stringify(e.details, null, 2)}</pre>}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RetentionBox({ days, canEdit, onSaved }: { days: number; canEdit: boolean; onSaved: (d: number) => void }) {
  const [value, setValue] = useState(String(days));
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setMsg(null);
    const r = await fetch("/api/admin/audit", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retentionDays: Number(value) }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      onSaved(d.retentionDays);
      setMsg("Збережено");
    } else setMsg(d.error || "Не вдалося зберегти");
  }
  return (
    <div className="audit-retention">
      <span>
        Записи співробітників і системи зберігаються <b>{days} днів</b>, дії адмінів — назавжди.
      </span>
      {canEdit && (
        <span className="audit-retention-edit">
          <input
            className="admin-input"
            type="number"
            min={30}
            max={3650}
            value={value}
            aria-label="Термін зберігання, днів"
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="button" className="admin-btn" onClick={save} disabled={Number(value) === days}>
            Зберегти
          </button>
          {msg && <span className="admin-hint">{msg}</span>}
        </span>
      )}
    </div>
  );
}

/**
 * /admin/audit — повний журнал дій платформи (2026-10-04): хто (роль, ім'я,
 * посада), що, над чим і розбір людською мовою. Фільтри — роль, розділ, пошук
 * за людиною чи дією; клік по імені — лише дії цієї людини.
 */
export function AdminAudit() {
  const [data, setData] = useState<Page | null>(null);
  const [actor, setActor] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const params = (cursor?: number | null) => {
    const p = new URLSearchParams();
    if (actor) p.set("actor", actor);
    if (category) p.set("category", category);
    if (q) p.set("q", q);
    if (person) p.set("employeeId", String(person.id));
    if (cursor) p.set("cursor", String(cursor));
    return p;
  };

  useEffect(() => {
    let alive = true;
    const t = setTimeout(
      () =>
        fetch(`/api/admin/audit?${params()}`)
          .then((r) => r.json())
          .then((d: Page) => alive && setData(d)),
      250
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // params() читає саме ці фільтри.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, category, q, person]);

  async function loadMore() {
    if (!data?.nextCursor) return;
    setLoadingMore(true);
    const next: Page = await fetch(`/api/admin/audit?${params(data.nextCursor)}`).then((r) => r.json());
    setData({ ...next, entries: [...data.entries, ...next.entries] });
    setLoadingMore(false);
  }

  return (
    <div className="admin-page adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Журнал дій</h1>
          <p className="admin-subtitle">
            Хто, що й коли робив на платформі: адмінка, входи, навчання, дії керівників, профіль, активність, фонові задачі. Лише читання.
          </p>
        </div>
      </div>

      {data && <RetentionBox key={data.retentionDays} days={data.retentionDays} canEdit={data.canEditRetention} onSaved={(d) => setData({ ...data, retentionDays: d })} />}

      <div className="adm-toolbar">
        <select className="admin-select" aria-label="Роль" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">Усі ролі</option>
          {Object.entries(ROLES).map(([k, r]) => (
            <option key={k} value={k}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="admin-select" aria-label="Розділ" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Усі розділи</option>
          {Object.entries(CATEGORIES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input className="admin-input-flex" placeholder="Ім'я, код або дія…" aria-label="Пошук" value={q} onChange={(e) => setQ(e.target.value)} />
        {person && (
          <button type="button" className="audit-person-chip" onClick={() => setPerson(null)} title="Показати всіх">
            Лише: {person.name} <XIcon />
          </button>
        )}
        {/* Та сама кнопка, що «Завантажити звіт» у кабінеті керівника; у файл —
            рівно те, що зараз відфільтровано на екрані (lib/auditQuery.ts). */}
        <a className="admin-btn-link mgr-export-link audit-export" href={`/api/admin/audit/export?${params()}`} title="Вивантажити в Excel з поточними фільтрами">
          <ExcelIcon /> <span className="mgr-export-label">Excel</span>
        </a>
      </div>

      {!data ? (
        <LoadingLine className="admin-hint" />
      ) : data.entries.length === 0 ? (
        <p className="admin-hint">Записів за цими фільтрами нема.</p>
      ) : (
        <>
          <AuditGrid entries={data.entries} onPerson={setPerson} />
          {data.nextCursor && (
            <button type="button" className="admin-btn audit-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <SpinnerIcon />} Показати ще
            </button>
          )}
        </>
      )}
    </div>
  );
}
