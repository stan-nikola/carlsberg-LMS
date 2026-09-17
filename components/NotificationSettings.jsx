"use client";

import { useEffect, useRef, useState } from "react";
import { NOTIFICATION_CATEGORIES, telegramCategoryKey } from "@/lib/notificationTypes";
import { getPushState, subscribeToPush, unsubscribeFromPush } from "@/lib/pushClient";
import { BellIcon, ChevronIcon, TelegramIcon, SpinnerIcon } from "@/components/icons";

const DISMISS_KEY = "carls_push_prompt_dismissed_until";
const DISMISS_DAYS = 14;

const STATE_TEXT = {
  "ios-not-installed":
    "На iPhone сповіщення працюють лише зі встановленого застосунку: Поділитись → «На Початковий екран», далі відкрийте CarLS з іконки.",
  unsupported: "Цей браузер не підтримує push-сповіщення.",
  insecure: "Push працює лише за захищеною адресою (https). Відкрийте застосунок за https-посиланням і встановіть його звідти.",
  denied: "Сповіщення заблоковано в налаштуваннях браузера/системи — увімкніть їх там, щоб отримувати push.",
  unavailable: "Push ще не налаштовано на сервері (немає VAPID-ключів). Сповіщення видно в центрі — дзвіночок угорі.",
};

/**
 * Push на цьому пристрої + категорії. variant="card" — м'яка картка на
 * головній хаба: лише кнопка «Увімкнути», ховається на 14 днів після
 * «Пізніше» і зовсім — після підписки. variant="full" — блок у профілі з
 * перемикачами категорій.
 */
export function NotificationSettings({ variant = "full" }) {
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [hidden, setHidden] = useState(variant === "card");
  // Категорії — під шевроном, згорнуті: у профілі це другорядне налаштування,
  // п'ять рядків одразу перевантажували екран (користувач, 2026-09-15).
  // Push і Telegram — два НЕЗАЛЕЖНІ розкривні списки з тими самими 5
  // категоріями (користувач, 2026-09-17): можна отримувати курси push-ом,
  // а дедлайни — лише в Telegram, кожен канал розгортається окремо.
  const [pushPrefsOpen, setPushPrefsOpen] = useState(false);
  const [tgPrefsOpen, setTgPrefsOpen] = useState(false);
  // Telegram: null — ще не завантажено; { configured, botUsername, link, linkUrl }.
  // Після тапу «Підключити» відкривається бот, а ми опитуємо стан кожні
  // 3с до 2 хв — прив’язка з’являється без перезавантаження сторінки.
  const [tg, setTg] = useState(null);
  const [tgWaiting, setTgWaiting] = useState(false);
  const tgPoll = useRef(null);

  async function loadTelegram() {
    try {
      const d = await fetch("/api/notifications/telegram").then((r) => r.json());
      setTg(d);
      return d;
    } catch {
      return null;
    }
  }
  function stopTgPoll() {
    if (tgPoll.current) clearInterval(tgPoll.current);
    tgPoll.current = null;
    setTgWaiting(false);
  }
  function tgConnect() {
    if (!tg?.linkUrl) return;
    window.open(tg.linkUrl, "_blank", "noopener");
    setTgWaiting(true);
    let tries = 0;
    tgPoll.current = setInterval(async () => {
      tries += 1;
      const d = await loadTelegram();
      if (d?.link || tries >= 40) stopTgPoll();
    }, 3000);
  }
  async function tgDisconnect() {
    if (!window.confirm("Відключити Telegram? Сповіщення в чат бота більше не приходитимуть.")) return;
    await fetch("/api/notifications/telegram", { method: "DELETE" });
    loadTelegram();
  }
  useEffect(() => () => stopTgPoll(), []);

  useEffect(() => {
    getPushState().then(setState);
    if (variant === "card") {
      let until = 0;
      try {
        until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      } catch {
        until = 0;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHidden(Date.now() < until);
    } else {
      fetch("/api/notifications/preferences")
        .then((r) => r.json())
        .then((d) => setPrefs(d.preferences))
        .catch(() => {});
      loadTelegram();
    }
  }, [variant]);

  async function enable() {
    setBusy(true);
    try {
      setState(await subscribeToPush());
    } catch {
      setState("unsupported");
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    await unsubscribeFromPush();
    setState("not-subscribed");
    setBusy(false);
  }
  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    } catch {
      // приватний режим — просто сховаємо до перезавантаження
    }
    setHidden(true);
  }
  async function toggle(key, value) {
    setPrefs((p) => ({ ...p, [key]: value }));
    await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
  }

  if (variant === "card") {
    if (hidden || state === "loading" || state === "subscribed" || state === "unsupported") return null;
    return (
      <div className="ntf-card">
        <span className="settings-ico">
          <BellIcon />
        </span>
        <div className="ntf-card-body">
          <b>Отримуйте сповіщення</b>
          <span>{STATE_TEXT[state] || "Нові курси, дедлайни та відзнаки — одразу на цей пристрій."}</span>
          <div className="ntf-card-actions">
            {state === "not-subscribed" && (
              <button type="button" className="btn-primary-full" onClick={enable} disabled={busy}>
                Увімкнути
              </button>
            )}
            <button type="button" className="btn-secondary-full" onClick={dismiss}>
              Пізніше
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pushOnCount = prefs ? NOTIFICATION_CATEGORIES.filter((c) => prefs[c.key] !== false).length : 0;
  const tgOnCount = prefs ? NOTIFICATION_CATEGORIES.filter((c) => prefs[telegramCategoryKey(c.key)] !== false).length : 0;

  return (
    <div className="settings-block ntf-settings">
      {/* Push і Telegram — два ОДНАКОВІ блоки: рядок каналу (іконка, назва,
          стан, кнопка Увімкнути/Вимкнути однакової ширини) сам є кнопкою-
          шевроном, що розгортає СВІЙ окремий список тих самих 5 категорій
          (користувач, 2026-09-17). */}
      <div className="settings-row">
        <button
          type="button"
          className={`settings-label ntf-row-toggle${pushPrefsOpen ? " open" : ""}`}
          onClick={() => setPushPrefsOpen((v) => !v)}
          aria-expanded={pushPrefsOpen}
          disabled={!prefs}
        >
          <span className="ntf-expand" aria-hidden="true">
            <ChevronIcon />
          </span>
          <span className="settings-ico">
            <BellIcon />
          </span>
          <span className="ntf-row-text">
            <span className="settings-t">Push на цьому пристрої</span>
            <span className="settings-d">
              {STATE_TEXT[state] || (state === "subscribed" ? "Увімкнено" : "Вимкнено")}
              {prefs && state === "subscribed" && ` · ${pushOnCount} з ${NOTIFICATION_CATEGORIES.length} категорій`}
            </span>
          </span>
        </button>
        {state === "subscribed" && (
          <button type="button" className="admin-btn ntf-row-btn" onClick={disable} disabled={busy}>
            Вимкнути
          </button>
        )}
        {state === "not-subscribed" && (
          <button type="button" className="admin-btn ntf-row-btn" onClick={enable} disabled={busy}>
            Увімкнути
          </button>
        )}
      </div>
      {prefs && pushPrefsOpen && (
        <div className="ntf-prefs">
          {NOTIFICATION_CATEGORIES.map((c) => (
            <label key={c.key} className="ntf-pref">
              <input type="checkbox" checked={prefs[c.key] !== false} onChange={(e) => toggle(c.key, e.target.checked)} />
              <span className="ntf-pref-ico" aria-hidden="true">
                {c.icon}
              </span>
              <span className="ntf-pref-label">{c.label}</span>
            </label>
          ))}
        </div>
      )}

      {tg?.configured && (
        <>
          <div className="settings-row">
            <button
              type="button"
              className={`settings-label ntf-row-toggle${tgPrefsOpen ? " open" : ""}`}
              onClick={() => setTgPrefsOpen((v) => !v)}
              aria-expanded={tgPrefsOpen}
              disabled={!prefs}
            >
              <span className="ntf-expand" aria-hidden="true">
                <ChevronIcon />
              </span>
              <span className="settings-ico">
                <TelegramIcon />
              </span>
              <span className="ntf-row-text">
                <span className="settings-t">Telegram</span>
                <span className="settings-d">
                  {tg.link
                    ? `Увімкнено: ${tg.link.username ? "@" + tg.link.username : tg.link.firstName || "чат"}${prefs ? ` · ${tgOnCount} з ${NOTIFICATION_CATEGORIES.length} категорій` : ""}`
                    : tgWaiting
                      ? "Натисніть Start у Telegram — чекаємо підтвердження…"
                      : `Вимкнено — сповіщення в чат бота @${tg.botUsername}`}
                </span>
              </span>
            </button>
            {tg.link ? (
              <button type="button" className="admin-btn ntf-row-btn" onClick={tgDisconnect}>
                Вимкнути
              </button>
            ) : tgWaiting ? (
              <button type="button" className="admin-btn ntf-row-btn" onClick={stopTgPoll}>
                <SpinnerIcon />
                Скасувати
              </button>
            ) : (
              <button type="button" className="admin-btn ntf-row-btn" onClick={tgConnect} disabled={!tg.linkUrl}>
                Увімкнути
              </button>
            )}
          </div>
          {prefs && tgPrefsOpen && (
            <div className="ntf-prefs">
              {NOTIFICATION_CATEGORIES.map((c) => {
                const key = telegramCategoryKey(c.key);
                return (
                  <label key={key} className="ntf-pref">
                    <input type="checkbox" checked={prefs[key] !== false} onChange={(e) => toggle(key, e.target.checked)} />
                    <span className="ntf-pref-ico" aria-hidden="true">
                      {c.icon}
                    </span>
                    <span className="ntf-pref-label">{c.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
