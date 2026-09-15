"use client";

import { useEffect, useState } from "react";
import { NOTIFICATION_CATEGORIES } from "@/lib/notificationTypes";
import { getPushState, subscribeToPush, unsubscribeFromPush } from "@/lib/pushClient";
import { BellIcon, ChevronIcon } from "@/components/icons";

const DISMISS_KEY = "carls_push_prompt_dismissed_until";
const DISMISS_DAYS = 14;

const STATE_TEXT = {
  "ios-not-installed":
    "На iPhone сповіщення працюють лише зі встановленого застосунку: Поділитись → «На Початковий екран», далі відкрийте CarLS з іконки.",
  unsupported: "Цей браузер не підтримує push-сповіщення.",
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
  const [prefsOpen, setPrefsOpen] = useState(false);

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

  return (
    <div className="settings-block ntf-settings">
      <div className="settings-row">
        <div className="settings-label">
          <span className="settings-ico">
            <BellIcon />
          </span>
          <div>
            <div className="settings-t">Push на цьому пристрої</div>
            <div className="settings-d">{STATE_TEXT[state] || (state === "subscribed" ? "Увімкнено" : "Вимкнено")}</div>
          </div>
        </div>
        {state === "subscribed" && (
          <button type="button" className="admin-btn" onClick={disable} disabled={busy}>
            Вимкнути
          </button>
        )}
        {state === "not-subscribed" && (
          <button type="button" className="admin-btn" onClick={enable} disabled={busy}>
            Увімкнути
          </button>
        )}
      </div>
      {prefs && (
        <button type="button" className="settings-row ntf-prefs-toggle" onClick={() => setPrefsOpen((v) => !v)} aria-expanded={prefsOpen}>
          <div className="settings-label">
            <div>
              <div className="settings-t">Які сповіщення отримувати</div>
              <div className="settings-d">
                {NOTIFICATION_CATEGORIES.filter((c) => prefs[c.key] !== false).length} з {NOTIFICATION_CATEGORIES.length} категорій увімкнено
              </div>
            </div>
          </div>
          <span className={`ntf-chevron${prefsOpen ? " open" : ""}`} aria-hidden="true">
            <ChevronIcon />
          </span>
        </button>
      )}
      {prefs &&
        prefsOpen &&
        NOTIFICATION_CATEGORIES.map((c) => (
          <label key={c.key} className="settings-row ntf-pref">
            <div className="settings-label">
              <span className="settings-ico" aria-hidden="true">
                {c.icon}
              </span>
              <div>
                <div className="settings-t">{c.label}</div>
                <div className="settings-d">{c.hint}</div>
              </div>
            </div>
            <input type="checkbox" checked={prefs[c.key] !== false} onChange={(e) => toggle(c.key, e.target.checked)} />
          </label>
        ))}
    </div>
  );
}
