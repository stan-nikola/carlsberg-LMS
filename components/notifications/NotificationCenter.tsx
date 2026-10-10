"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { LinesSkeleton } from "@/components/ui/Skeleton";
import { useDeviceValue } from "@/components/ui/LocalDate";
import { XIcon } from "@/components/ui/icons";
import { RemindButton } from "@/components/manager/ReminderDialog";
import { api } from "@/lib/api";
import { NOTIFICATION_CATEGORIES, categoryMeta, formatRelativeTime, toManagerUrl } from "@/lib/notificationTypes";
import { REMINDABLE_TYPES, actionLabelFor, groupByDay, shortTime } from "@/lib/notificationView";
import { UKRAINE_TZ } from "@/lib/ukraineTime";

export type NotificationItem = {
  id: number;
  type: string;
  category: string;
  title: string | null;
  message: string;
  url: string | null;
  isRead: boolean;
  createdAt: string | Date;
  /** Людина, про яку подія (lib/notificationFeed.ts withPeople) — аватар у рядку керівника. */
  person?: { id: number; name: string; avatarUrl: string | null };
};

type Props = {
  initialItems?: NotificationItem[];
  initialCursor?: number | null;
  initialUnreadCount?: number;
  managerMode?: boolean;
  highlightId?: number | null;
};

/**
 * Стрічка сповіщень (центр). Відкрили — усе позначається прочитаним
 * (патерн месенджерів: «побачив список = прочитав»), окремих галочок нема.
 * Спільна для /hub і /manager.
 *
 * Перша сторінка приходить ГОТОВОЮ з сервера (app/manager/notifications/
 * page.js, app/hub/notifications/page.js — lib/notificationFeed.ts,
 * "use cache: private"): JSON-відповідь Route Handler не бере участі в
 * клієнтському Router Cache, тож fetch() на монтуванні показував би порожній
 * список зі скелетоном на кожен перехід. load(after) лишається клієнтським —
 * це пагінація «Показати ще» по кліку, не первинне завантаження.
 *
 * `managerMode` — центр у кабінеті керівника (рішення користувача, 2026-10-10,
 * за патернами LinkedIn/GitHub/Duolingo): групи за днями, чипи-фільтри за
 * розділом з лічильником нових, рядок — аватар людини (для подій про
 * підлеглого) або кружок-іконка, заголовок, текст у два рядки (клік по рядку
 * розгортає), короткий час, кнопка дії за адресою запису й «Нагадати» там, де
 * керівнику є кому. Видалення — «×» на записі й «Очистити все». Старі рядки в
 * базі мають адреси /hub/… — підміняємо на показі (toManagerUrl), щоб нічого не
 * переписувати. Хаб — плаский список, як і був.
 *
 * `highlightId` — прийшли з push чи Telegram (?highlight=<id сповіщення>): запис
 * один раз спалахує (.is-highlight, той самий спалах, що рамка рейтингу після
 * кліку на зелену картку Home) і прокручується в центр. Якщо запису нема в
 * перших 30 (кеш стрічки трохи відстає від свіжого push), стрічка один раз
 * перечитується з сервера.
 */
export function NotificationCenter({ initialItems = [], initialCursor = null, initialUnreadCount = 0, managerMode = false, highlightId = null }: Props) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const highlightRef = useRef<HTMLElement | null>(null);
  const refreshedFor = useRef<number | null>(null);
  // Пояс показу: пристрою в браузері, український у розмітці з сервера — той
  // самий прийом, що LocalDate; рядок, а не об'єкт, щоб знімок був стабільним.
  const zone = useDeviceValue(() => Intl.DateTimeFormat().resolvedOptions().timeZone, () => UKRAINE_TZ);
  // Синхронізація з новими пропсами ПІД ЧАС рендеру (не в ефекті) —
  // той самий патерн, що вже в ManagerDashboard.tsx: після pull-to-
  // refresh сервер віддає нові initialItems/initialCursor, і useState
  // ігнорує зміну початкового значення на повторних рендерах без цього.
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
    setCursor(initialCursor);
  }

  async function load(after: number | null) {
    setLoading(true);
    try {
      const data = await api<{ items: NotificationItem[]; nextCursor: number | null }>(`/api/notifications${after ? `?cursor=${after}` : ""}`);
      setItems((prev) => (after ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  // "Побачив список = прочитав" — мутація, не частина кешованого читання,
  // тож лишається окремим client-side POST. Залежність саме на
  // initialUnreadCount (примітив із пропсів), не ref-прапорець: спрацює
  // знову й після pull-to-refresh, якщо прийшли нові непрочитані.
  useEffect(() => {
    if (initialUnreadCount === 0) return;
    api("/api/notifications/read", { method: "POST", body: { all: true } }).catch(() => {}); // офлайн — позначимо при наступному відкритті
  }, [initialUnreadCount]);

  const highlightFound = highlightId != null && items.some((n) => n.id === highlightId);
  useEffect(() => {
    if (highlightId == null || highlightFound || refreshedFor.current === highlightId) return;
    refreshedFor.current = highlightId;
    void load(null);
  }, [highlightId, highlightFound]);
  useEffect(() => {
    if (highlightFound) highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightFound]);

  async function remove(body: { ids: number[] } | { all: true }) {
    const snapshot = { items, cursor };
    setError("");
    setConfirmClear(false);
    if ("all" in body) {
      setItems([]);
      setCursor(null);
    } else {
      setItems((prev) => prev.filter((n) => !body.ids.includes(n.id)));
    }
    try {
      await api("/api/notifications", { method: "DELETE", body });
    } catch {
      setItems(snapshot.items);
      setCursor(snapshot.cursor);
      setError("Не вдалося видалити. Спробуйте ще раз.");
    }
  }

  function toggleOpen(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!loading && items.length === 0) return <p className="hub-empty-note">Поки що жодного сповіщення.</p>;

  const highlightRefFor = (n: NotificationItem) => (n.id === highlightId ? (el: HTMLElement | null) => void (highlightRef.current = el) : undefined);
  const more = cursor && !loading && (
    <button type="button" className="btn-secondary-full" onClick={() => load(cursor)}>
      Показати ще
    </button>
  );

  if (!managerMode) {
    return (
      <div className="ntf-list">
        {items.map((n, i) => {
          const meta = categoryMeta(n.category);
          // --k — черга «дзижчання» непрочитаних (notifications.css ntfBuzz):
          // по одному зверху вниз, а не всі разом.
          const style = n.isRead ? undefined : ({ "--k": items.slice(0, i).filter((x) => !x.isRead).length } as React.CSSProperties);
          const body = (
            <>
              <span className="ntf-ico" aria-hidden="true">
                {meta.icon}
              </span>
              <span className="ntf-body">
                {n.title && <b className="ntf-title">{n.title}</b>}
                <span className="ntf-msg">{n.message}</span>
                <span className="ntf-time">{formatRelativeTime(n.createdAt)}</span>
              </span>
            </>
          );
          const cls = `ntf-item${n.isRead ? "" : " unread"}${n.id === highlightId ? " is-highlight" : ""}`;
          return n.url ? (
            <Link key={n.id} href={n.url} className={cls} style={style} ref={highlightRefFor(n)}>
              {body}
            </Link>
          ) : (
            <div key={n.id} className={cls} style={style} ref={highlightRefFor(n)}>
              {body}
            </div>
          );
        })}
        {loading && <LinesSkeleton rows={items.length ? 2 : 5} />}
        {more}
      </div>
    );
  }

  // --- кабінет керівника ---
  const now = new Date();
  const unreadBy = (key: string) => items.filter((n) => !n.isRead && (key === "all" || n.category === key)).length;
  const chips = [{ key: "all", label: "Усі" }, ...NOTIFICATION_CATEGORIES.filter((c) => items.some((n) => n.category === c.key))];
  const shown = filter === "all" ? items : items.filter((n) => n.category === filter);
  const groups = groupByDay(shown, now, zone);
  let unreadIndex = 0;

  return (
    <div className="ntf-list ntf-list--mgr">
      <div className="ntf-toolbar">
        <div className="ntf-chips" role="tablist" aria-label="Розділ">
          {chips.map((c) => {
            const fresh = unreadBy(c.key);
            return (
              <button key={c.key} type="button" role="tab" aria-selected={filter === c.key} className={`mgr-filter-chip${filter === c.key ? " is-active" : ""}`} onClick={() => setFilter(c.key)}>
                {c.label}
                {fresh > 0 && <span className="ntf-chip-count">{fresh}</span>}
              </button>
            );
          })}
        </div>
        {confirmClear ? (
          <span className="ntf-toolbar-actions">
            <span>Видалити всі сповіщення?</span>
            <button type="button" className="admin-btn adm-btn-danger" onClick={() => remove({ all: true })}>
              Так, видалити
            </button>
            <button type="button" className="admin-btn adm-btn-secondary" onClick={() => setConfirmClear(false)}>
              Скасувати
            </button>
          </span>
        ) : (
          <button type="button" className="admin-btn adm-btn-secondary" onClick={() => setConfirmClear(true)}>
            Очистити все
          </button>
        )}
      </div>
      {error && (
        <p className="ntf-error" role="alert">
          {error}
        </p>
      )}
      {shown.length === 0 && !loading && <p className="hub-empty-note">У цьому розділі поки порожньо.</p>}
      {groups.map((g) => (
        <section key={g.key} className="ntf-group" aria-label={g.label}>
          <h2 className="ntf-group-title">{g.label}</h2>
          {g.items.map((n) => {
            const meta = categoryMeta(n.category);
            const style = n.isRead ? undefined : ({ "--k": unreadIndex++ } as React.CSSProperties);
            const href = toManagerUrl(n.url);
            const action = actionLabelFor(href);
            const remindable = n.person && REMINDABLE_TYPES.has(n.type);
            const isOpen = open.has(n.id);
            return (
              <div key={n.id} className="ntf-row">
                <div
                  className={`ntf-item${n.isRead ? "" : " unread"}${n.id === highlightId ? " is-highlight" : ""}${isOpen ? " is-open" : ""}`}
                  style={style}
                  ref={highlightRefFor(n)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => toggleOpen(n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleOpen(n.id);
                    }
                  }}
                >
                  {n.person ? (
                    <Avatar name={n.person.name} src={n.person.avatarUrl} size="sm" className="ntf-avatar" />
                  ) : (
                    <span className="ntf-ico" aria-hidden="true">
                      {meta.icon}
                    </span>
                  )}
                  <span className="ntf-body">
                    <span className="ntf-head">
                      {!n.isRead && <span className="ntf-dot" role="img" aria-label="Нове" />}
                      {n.title && <b className="ntf-title">{n.title}</b>}
                      <span className="ntf-time">{shortTime(n.createdAt, now, zone)}</span>
                    </span>
                    <span className="ntf-msg">{n.message}</span>
                    {(action || remindable) && (
                      <span className="ntf-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        {href && action && (
                          <Link href={href} className="admin-btn adm-btn-secondary">
                            {action}
                          </Link>
                        )}
                        {remindable && n.person && (
                          <RemindButton recipients={[{ id: n.person.id, name: n.person.name }]} reason={n.type === "subordinate_course_failed" ? "failed" : "overdue"} className="admin-btn adm-btn-secondary" />
                        )}
                      </span>
                    )}
                  </span>
                </div>
                <button type="button" className="ntf-del" aria-label="Видалити сповіщення" title="Видалити" onClick={() => remove({ ids: [n.id] })}>
                  <XIcon />
                </button>
              </div>
            );
          })}
        </section>
      ))}
      {loading && <LinesSkeleton rows={items.length ? 2 : 5} />}
      {more}
    </div>
  );
}
