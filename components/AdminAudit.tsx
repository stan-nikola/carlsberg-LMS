"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpinnerIcon, XIcon } from "@/components/icons";

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

const ROLES: Record<string, { label: string; className: string }> = {
  super: { label: "Супер-адмін", className: "status-pill audit-role-super" },
  admin: { label: "Адмін", className: "status-pill status-pill-success" },
  manager: { label: "Керівник", className: "status-pill status-pill-alert" },
  employee: { label: "Співробітник", className: "status-pill" },
  system: { label: "Система", className: "status-pill" },
};

const CATEGORIES: Record<string, string> = {
  auth: "Входи",
  learning: "Навчання",
  manager: "Дії керівників",
  profile: "Профіль і сповіщення",
  activity: "Активність",
  admin: "Адмінка",
  system: "Система",
};

const ACTION_LABELS: Record<string, string> = {
  // входи
  "auth.pin_requested": "Запит PIN",
  "auth.login": "Вхід",
  "auth.login_failed": "Невдалий вхід",
  "auth.logout": "Вихід",
  "admin.login": "Вхід в адмінку",
  "admin.login_failed": "Невдалий вхід в адмінку",
  "admin.logout": "Вихід з адмінки",
  // навчання
  "learning.course_start": "Почав курс",
  "learning.module_complete": "Пройшов модуль",
  "learning.course_complete": "Завершив курс",
  "learning.certificate": "Завантажив сертифікат",
  // керівники
  "manager.remind": "Нагадування команді",
  "manager.export": "Excel-звіт по команді",
  // профіль і сповіщення
  "profile.avatar_update": "Змінив фото профілю",
  "profile.avatar_delete": "Прибрав фото профілю",
  "profile.notifications_update": "Налаштування сповіщень",
  "profile.telegram_link": "Підключив Telegram",
  "profile.telegram_unlink": "Відключив Telegram",
  "profile.push_subscribe": "Увімкнув push",
  "profile.push_unsubscribe": "Вимкнув push",
  "activity.visit": "Був у застосунку",
  "system.cron": "Щоденні фонові задачі",
  "audit.retention": "Термін зберігання журналу",
  // адмінка
  "enrollment.update": "Корекція проходження",
  "enrollment.delete": "Знято призначення",
  "employee.update": "Зміна картки співробітника",
  "employee.create": "Створено співробітника",
  "employee.import": "Імпорт співробітників",
  "badge.award": "Видано відзнаку",
  "badge.award_bulk": "Масова видача відзнаки",
  "badge.revoke": "Відкликано відзнаку",
  "badge.delete": "Видалено тип відзнаки",
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
  "telegram.webhook": "Увімкнено Telegram webhook",
  "telegram.menu_button": "Увімкнено кнопку меню Mini App",
  "telegram.unlink": "Відключено Telegram",
  "telegram.test": "Тест у Telegram",
};

const LOGIN_FAIL: Record<string, string> = {
  invalid_pin: "невірний PIN",
  pin_expired: "PIN прострочений",
  deactivated: "обліковий запис деактивовано",
};

const KEY_LABELS: Record<string, string> = {
  title: "назва",
  name: "ім'я",
  note: "примітка",
  count: "кількість",
  awardedCount: "видано",
  skippedCount: "пропущено",
  createdCount: "створено",
  assignedCount: "призначено",
  removed: "прибрано",
  scorePercent: "бал",
  status: "статус",
  passed: "складено",
  points: "бали",
  adminNote: "коментар адміна",
  from: "було",
  to: "стало",
};

const s = (v: unknown) => (v == null ? "" : String(v));
const yesNo = (v: unknown) => (v === true ? "так" : v === false ? "ні" : s(v));

/** Розбір запису людською мовою: що саме сталось, з тими цифрами, що є в деталях. */
function describe(e: Entry): string {
  const d = e.details || {};
  switch (e.action) {
    case "auth.pin_requested":
      return d.demo ? "PIN надіслано на пошту з тестового входу" : "PIN надіслано на пошту керівника";
    case "auth.login":
      return "Підтвердив PIN і увійшов";
    case "auth.login_failed":
      return `Вхід не вдався: ${LOGIN_FAIL[s(d.reason)] || s(d.reason)}`;
    case "auth.logout":
      return "Вийшов із застосунку";
    case "admin.login":
      return e.actor === "super" ? "Увійшов паролем супер-адміна" : "Увійшов паролем адміна";
    case "admin.login_failed":
      return "Невірний пароль адмінки";
    case "admin.logout":
      return "Вийшов з адмінки";
    case "learning.course_start":
      return "Перша відповідь у курсі — курс перейшов у «в процесі»";
    case "learning.module_complete":
      return `Модуль «${s(d.module)}» курсу «${s(d.course)}»: ${s(d.scorePercent)}% — ${d.passed ? "складено" : "не складено"}, спроба ${s(d.attempt)}`;
    case "learning.course_complete":
      return `Курс «${s(d.course)}»: ${s(d.scorePercent)}% — ${d.passed ? "складено" : "не складено"}${d.first ? "" : " (перескладання)"}`;
    case "learning.certificate":
      return `Сертифікат PDF (${s(d.scorePercent)}%)`;
    case "manager.remind":
      return d.via === "telegram"
        ? `Нагадування з Mini App${d.course ? ` про «${s(d.course)}»` : ""}`
        : `Нагадування ${s(d.recipients)} людям${d.message ? `: «${s(d.message)}»` : ""}`;
    case "manager.export":
      return `Звіт, аркушів: ${s(d.cards)}`;
    case "profile.notifications_update":
      return Object.entries(d)
        .map(([k, v]) => `${k}: ${v ? "увімк." : "вимк."}`)
        .join(", ");
    case "profile.telegram_unlink":
      return d.via === "/stop" ? "Командою /stop у боті" : "З профілю";
    case "activity.visit":
      return "Відкривав застосунок (фіксується не частіше разу на годину)";
    case "system.cron": {
      const r = d as Record<string, Record<string, unknown>>;
      return [
        r.overdue && `прострочено ${s(r.overdue.markedCount)}`,
        r.reminders && `нагадувань ${s(r.reminders.created)}`,
        r.badges && `відзнак ${s(r.badges.awardedCount)}`,
        r.digests && `дайджестів ${s(r.digests.created)}`,
        r.auditPurge && `прибрано з журналу ${s(r.auditPurge.removed)}`,
      ]
        .filter(Boolean)
        .join(", ");
    }
    case "audit.retention":
      return `${s(d.from)} → ${s(d.to)} днів`;
    default:
      return Object.entries(d)
        .filter(([, v]) => v != null && v !== "" && typeof v !== "object")
        .map(([k, v]) => `${KEY_LABELS[k] || k}: ${typeof v === "boolean" ? yesNo(v) : s(v)}`)
        .join(" · ");
  }
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
  const [open, setOpen] = useState<number | null>(null);
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
      </div>

      {!data ? (
        <p className="admin-hint">
          <SpinnerIcon /> Завантаження…
        </p>
      ) : data.entries.length === 0 ? (
        <p className="admin-hint">Записів за цими фільтрами нема.</p>
      ) : (
        <>
          <div className="adm-table-wrap is-tall">
            <table className="admin-table admin-audit-table">
              <thead>
                <tr>
                  <th>Коли</th>
                  <th>Хто</th>
                  <th>Дія</th>
                  <th>Об&apos;єкт</th>
                  <th>Розбір</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => {
                  const role = ROLES[e.actor] || { label: e.actor, className: "status-pill" };
                  const text = describe(e);
                  return (
                    <tr key={e.id}>
                      <td className="admin-employee-meta audit-when">{new Date(e.createdAt).toLocaleString("uk-UA")}</td>
                      <td className="audit-who">
                        <span className={role.className}>{role.label}</span>
                        {e.person && (
                          <>
                            <button type="button" className="audit-person" onClick={() => setPerson(e.person)} title="Лише дії цієї людини">
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
                      </td>
                      <td>{ACTION_LABELS[e.action] || e.action}</td>
                      <td className="admin-employee-meta">
                        {e.target ? e.target.href ? <Link href={e.target.href}>{e.target.label}</Link> : e.target.label : e.targetId != null ? `#${e.targetId}` : "—"}
                      </td>
                      <td>
                        <span className="audit-describe">{text || "—"}</span>
                        {e.details && (
                          <button type="button" className="audit-raw-toggle" onClick={() => setOpen(open === e.id ? null : e.id)}>
                            {open === e.id ? "сховати дані" : "дані"}
                          </button>
                        )}
                        {open === e.id && <pre className="admin-audit-details open">{JSON.stringify(e.details, null, 2)}</pre>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
