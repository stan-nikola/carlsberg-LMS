"use client";

import { useEffect, useMemo, useState } from "react";
import { SpinnerIcon, XIcon, TelegramIcon } from "@/components/ui/icons";
import { AccordionField } from "@/components/ui/AccordionField";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/localDate";

type LinkRow = {
  employeeId: number;
  name: string;
  externalCode: string;
  position: string | null;
  username: string | null;
  firstName: string | null;
  linkedAt: string;
  lastSentAt: string | null;
  lastError: string | null;
};
type InboundRow = { id: number; createdAt: string; chatId: string; username: string | null; employee: string | null; text: string };
type Data = {
  configured: boolean;
  webhookSecretSet: boolean;
  botUsername: string;
  base: string | null;
  expectedWebhookUrl: string | null;
  webhook: { url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string } | null;
  webhookError: string | null;
  expectedMiniAppUrl: string | null;
  menuButtonUrl: string | null;
  links: LinkRow[];
  inbound: InboundRow[];
};

const fmt = (d: string | null | undefined) => (d ? formatDateTime(d) : "—");

/**
 * /admin/notifications → Telegram: стан бота, прив’язки співробітників
 * (відключити по одному/масово, тест), журнал вхідних. Дані —
 * app/api/admin/telegram.
 */
export function AdminTelegram() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      setData(await api("/api/admin/telegram"));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action + (extra.employeeId ?? ""));
    setNotice("");
    try {
      const d = await api("/api/admin/telegram", { method: "POST", body: { action, ...extra } });
      setNotice(
        action === "webhook"
          ? `Webhook увімкнено: ${d.url}`
          : action === "menu_button"
            ? `Кнопку меню увімкнено: ${d.url}`
            : "Тестове повідомлення доставлено"
      );
      await load();
    } catch (err) {
      setNotice("Помилка: " + (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function unlink(ids: number[]) {
    const n = ids.length;
    if (!window.confirm(`Відключити Telegram у ${n === 1 ? "цього співробітника" : n + " співробітників"}? Вони зможуть підключити знову з профілю.`)) return;
    setBusy("unlink");
    try {
      await api("/api/admin/telegram", { method: "DELETE", body: { employeeIds: ids } });
      setSelected(new Set());
      await load();
    } catch (err) {
      window.alert("Не вдалося відключити: " + (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => {
    const list = data?.links || [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((l) => [l.name, l.externalCode, l.username || "", l.firstName || "", l.position || ""].some((v) => v.toLowerCase().includes(s)));
  }, [data, q]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.employeeId));

  if (error) return <p className="admin-hint">Не вдалося завантажити Telegram: {error}</p>;
  if (!data) return <p className="admin-hint"><SpinnerIcon /> Завантаження Telegram…</p>;

  const webhookOk = Boolean(data.webhook?.url) && (!data.expectedWebhookUrl || data.webhook?.url === data.expectedWebhookUrl);
  const menuButtonOk = Boolean(data.menuButtonUrl) && (!data.expectedMiniAppUrl || data.menuButtonUrl === data.expectedMiniAppUrl);

  return (
    <>
      <section className="adm-card">
        <div className="adm-card-head">
          <h2>
            <TelegramIcon /> Telegram-бот @{data.botUsername}
          </h2>
          <span className="admin-hint">Той самий канал, що push: курси, дедлайни, відзнаки, розсилки — у чат бота</span>
        </div>
        <dl className="adm-tg-status">
          <dt>Токен бота</dt>
          <dd className={data.configured ? "adm-tg-ok" : "adm-tg-bad"}>{data.configured ? "задано" : "не задано — TELEGRAM_BOT_TOKEN у Vercel (див. DEPLOY.md)"}</dd>
          <dt>Секрет webhook</dt>
          <dd className={data.webhookSecretSet ? "adm-tg-ok" : "adm-tg-bad"}>{data.webhookSecretSet ? "задано" : "не задано — TELEGRAM_WEBHOOK_SECRET"}</dd>
          <dt>Webhook</dt>
          <dd className={webhookOk ? "adm-tg-ok" : "adm-tg-bad"}>
            {data.webhookError
              ? `помилка: ${data.webhookError}`
              : data.webhook?.url
                ? `${data.webhook.url}${webhookOk ? "" : " (не збігається з адресою застосунку)"}`
                : "не увімкнено"}
            {data.webhook && data.webhook.pending_update_count > 0 && ` · в черзі: ${data.webhook.pending_update_count}`}
            {data.webhook?.last_error_message && (
              <div className="admin-hint">
                остання помилка: {data.webhook.last_error_message} ({fmt(data.webhook.last_error_date ? new Date(data.webhook.last_error_date * 1000).toISOString() : null)})
              </div>
            )}
          </dd>
          <dt>Адреса застосунку</dt>
          <dd>{data.base || "невідома — задайте APP_URL"}</dd>
          <dt>Кнопка меню (Mini App)</dt>
          <dd className={menuButtonOk ? "adm-tg-ok" : "adm-tg-bad"}>
            {data.menuButtonUrl ? `${data.menuButtonUrl}${menuButtonOk ? "" : " (не збігається з адресою застосунку)"}` : "не увімкнено"}
          </dd>
          <dt>Підключено</dt>
          <dd>{data.links.length} співробітників</dd>
        </dl>
        <div className="adm-card-foot">
          {notice && <p className="admin-hint">{notice}</p>}
          <button type="button" className="admin-btn adm-btn-secondary" onClick={load} disabled={busy !== null}>
            Оновити
          </button>
          <button
            type="button"
            className="admin-btn adm-btn-secondary"
            onClick={() => post("menu_button")}
            disabled={busy !== null || !data.configured || !data.base}
            title={!data.base ? "Потрібен APP_URL" : undefined}
          >
            {busy === "menu_button" ? <SpinnerIcon /> : menuButtonOk ? "Перевстановити кнопку Mini App" : "Увімкнути кнопку Mini App"}
          </button>
          {/* Головна дія картки — webhook (без нього бот не отримує /start):
              одна заливна кнопка, решта — другорядні. */}
          <button
            type="button"
            className="admin-btn"
            onClick={() => post("webhook")}
            disabled={busy !== null || !data.configured || !data.webhookSecretSet || !data.base}
            title={!data.base ? "Потрібен APP_URL" : undefined}
          >
            {busy === "webhook" ? <SpinnerIcon /> : webhookOk ? "Перереєструвати webhook" : "Увімкнути webhook"}
          </button>
        </div>
      </section>

      <section className="adm-card adm-wide">
        <div className="adm-card-head">
          <h2>Підключені</h2>
          {selected.size > 0 ? (
            <button type="button" className="admin-btn adm-btn-danger" onClick={() => unlink([...selected])} disabled={busy !== null}>
              {busy === "unlink" && <SpinnerIcon />}
              Відключити обрані ({selected.size})
            </button>
          ) : (
            <input
              className="admin-input-flex adm-tg-search"
              placeholder="Пошук: ім’я, код, @username"
              aria-label="Пошук підключених"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
        </div>
        {data.links.length === 0 ? (
          <p className="admin-hint">Ще ніхто не підключив. Кнопка «Підключити Telegram» — у профілі співробітника.</p>
        ) : rows.length === 0 ? (
          <p className="admin-hint">Нічого не знайдено.</p>
        ) : (
          <div className="adm-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <label className="adm-bc-selectall">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.employeeId)) : new Set())}
                    />
                    Виділити все
                  </label>
                </th>
                <th>Співробітник</th>
                <th>Посада</th>
                <th>Telegram</th>
                <th>Підключено</th>
                <th>Остання доставка</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.employeeId} className={selected.has(l.employeeId) ? "is-selected" : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Обрати ${l.name}`}
                      checked={selected.has(l.employeeId)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(l.employeeId);
                          else next.delete(l.employeeId);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>
                    <b>{l.name}</b>
                    <div className="admin-hint">{l.externalCode}</div>
                  </td>
                  <td>{l.position || "—"}</td>
                  <td>{l.username ? `@${l.username}` : l.firstName || "—"}</td>
                  <td>{fmt(l.linkedAt)}</td>
                  <td>
                    {fmt(l.lastSentAt)}
                    {l.lastError && <div className="admin-hint adm-tg-bad">{l.lastError}</div>}
                  </td>
                  <td className="adm-actions-cell">
                    <span className="adm-row-actions">
                      <button type="button" className="iconbtn" title="Надіслати тест" aria-label="Надіслати тест" onClick={() => post("test", { employeeId: l.employeeId })} disabled={busy !== null}>
                        {busy === `test${l.employeeId}` ? <SpinnerIcon /> : <TelegramIcon />}
                      </button>
                      <button type="button" className="iconbtn iconbtn-danger" title="Відключити" aria-label="Відключити" onClick={() => unlink([l.employeeId])} disabled={busy !== null}>
                        <XIcon />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className="adm-card adm-full">
        <AccordionField title="Вхідні повідомлення боту" summary={data.inbound.length ? `${data.inbound.length} останніх` : "порожньо"}>
          {data.inbound.length === 0 ? (
            <p className="admin-hint">Бот лише надсилає; усе, що люди пишуть йому у відповідь (крім /start і /stop), збирається тут.</p>
          ) : (
            <div className="adm-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Коли</th>
                  <th>Хто</th>
                  <th>Текст</th>
                </tr>
              </thead>
              <tbody>
                {data.inbound.map((m) => (
                  <tr key={m.id}>
                    <td>{fmt(m.createdAt)}</td>
                    <td>
                      {m.employee || "не підключений"}
                      <div className="admin-hint">{m.username ? `@${m.username}` : `chat ${m.chatId}`}</div>
                    </td>
                    <td>{m.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </AccordionField>
      </section>
    </>
  );
}
