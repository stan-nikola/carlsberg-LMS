"use client";

import { useEffect, useState } from "react";

/**
 * Єдиний екран Mini App — сам підлаштовується під роль (рішення
 * користувача, 2026-09-28): співробітнику показує його курси/дедлайни,
 * керівнику — команду. Ні входу, ні проходження курсу тут немає:
 * "Продовжити" завжди веде у справжній застосунок (через /go).
 *
 * Дані — НЕ через cookie-сесію (Mini App живе у вебʼю Telegram, своєї
 * сесії там нема), а через підписаний Telegram initData, який сервер сам
 * перевіряє (app/api/tg/overview, lib/telegramLogic.ts verifyInitData).
 */

type EmployeeCourse = {
  slug: string;
  title: string;
  status: string;
  overdue: boolean;
  dueDateLabel: string | null;
  scorePercent: number | null;
  passed: boolean | null;
  modulesTotal: number;
};
type TeamPersonRow = {
  id: number;
  name: string;
  positionName: string | null;
  segment: "overdue" | "behind" | "not_started" | "inactive" | "on_track" | null;
  segmentLabel: string | null;
  counts: { total: number; completed: number; overdue: number; inProgress: number; notStarted: number; failed: number };
};
type Overview =
  | { linked: false }
  | { linked: true; role: "employee"; name: string; courses: EmployeeCourse[] }
  | { linked: true; role: "manager"; name: string; people: TeamPersonRow[] };

// Той самий факт, що вже в app/go/route.ts: на iOS немає надійного способу
// перейти з вебʼю (Telegram чи будь-якого іншого) у встановлений PWA —
// показувати клікабельне посилання, яке нікуди не веде, гірше, ніж чесно
// сказати відкрити застосунок самостійно.
function isIOS() {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function courseUrl(slug: string) {
  return `${window.location.origin}/courses/${slug}`;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  completed: { label: "Складено", cls: "ok" },
  in_progress: { label: "У процесі", cls: "neutral" },
  not_started: { label: "Не почато", cls: "neutral" },
  overdue: { label: "Прострочено", cls: "bad" },
};

export default function TelegramMiniAppPage() {
  const [initData, setInitData] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // SDK-скрипт (app/tg/layout.tsx) вантажиться strategy="afterInteractive" —
    // тобто вже ПІСЛЯ монтування цього компонента, не до нього. Опитуємо,
    // поки window.Telegram.WebApp не з'явиться, замість читати його
    // одноразово тут-таки (спіймано живим тестом на проді, 2026-09-28:
    // без цього initData завжди був порожній, навіть у самому Telegram).
    let cancelled = false;
    let attempts = 0;
    const tryRead = () => {
      const tg = (
        window as {
          Telegram?: { WebApp?: { ready?: () => void; expand?: () => void; disableVerticalSwipes?: () => void; initData?: string } };
        }
      ).Telegram?.WebApp;
      if (tg) {
        tg.ready?.();
        tg.expand?.();
        // Без цього свайп вниз по списку курсів/команди Telegram сприймає
        // як жест "згорнути Mini App" і перехоплює його ДО того, як він
        // дійде до звичайного скролу сторінки, — сама сторінка при цьому
        // виглядає так, ніби просто не скролиться (живий тест, 2026-09-28:
        // портретна орієнтація ловила саме цей жест, у landscape Telegram
        // його не чіпає, тому там скролило нормально). Bot API 7.7+;
        // старіші клієнти метод просто не мають — optional chaining.
        tg.disableVerticalSwipes?.();
        if (!cancelled) setInitData(tg.initData || "");
        return;
      }
      attempts += 1;
      if (attempts >= 40) {
        // ~4с і нічого — це справді не Telegram (звичайний браузер).
        if (!cancelled) setInitData("");
        return;
      }
      setTimeout(tryRead, 100);
    };
    tryRead();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initData === null) return;
    if (!initData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Відкрийте цей екран через кнопку в боті CarLS у Telegram.");
      return;
    }
    fetch("/api/tg/overview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setError("Не вдалося завантажити дані. Спробуйте ще раз."));
  }, [initData]);

  if (error) return <p className="tg-empty">{error}</p>;
  if (!data) return <p className="tg-loading">Завантаження…</p>;
  if (!data.linked) return <NotLinked />;
  if (data.role === "manager") return <ManagerScreen name={data.name} people={data.people} />;
  return <EmployeeScreen name={data.name} courses={data.courses} />;
}

function NotLinked() {
  const ios = isIOS();
  return (
    <div className="tg-head">
      <h1>CarLS</h1>
      <p style={{ marginTop: 12 }}>
        Спочатку зареєструйтесь у CarLS і підключіть Telegram у профілі —
        {ios ? " відкрийте застосунок з головного екрана, розділ «Профіль»." : (
          <>
            {" "}
            <a href={`${typeof window !== "undefined" ? window.location.origin : ""}/hub/profile`}>перейдіть у профіль</a>.
          </>
        )}
      </p>
    </div>
  );
}

function EmployeeScreen({ name, courses }: { name: string; courses: EmployeeCourse[] }) {
  const attention = courses.filter((c) => c.overdue || c.status === "not_started" || (c.status === "completed" && c.passed === false));
  const ios = isIOS();

  return (
    <>
      <div className="tg-head">
        <h1>Привіт, {name.split(" ")[0]}!</h1>
        <p>Ваші курси</p>
      </div>

      {attention.length === 0 ? (
        <div className="tg-summary is-ok">
          <span className="ico">✅</span>
          <span>Усе гаразд — жоден курс не потребує уваги просто зараз.</span>
        </div>
      ) : (
        <div className="tg-summary is-attention">
          <span className="ico">⚠️</span>
          <span>
            {attention.length === 1 ? "Один курс потребує уваги" : `${attention.length} курси(ів) потребують уваги`} — див. нижче.
          </span>
        </div>
      )}

      <div className="tg-list">
        {courses.map((c) => {
          const meta = c.overdue ? STATUS_META.overdue : STATUS_META[c.status] || STATUS_META.not_started;
          const needsAction = c.overdue || c.status === "not_started" || (c.status === "completed" && c.passed === false);
          return (
            <div className="tg-row" key={c.slug}>
              <div className="tg-row-top">
                <span className="tg-row-title">{c.title}</span>
                <span className={`tg-pill ${meta.cls}`}>{meta.label}</span>
              </div>
              <span className="tg-row-meta">
                {c.dueDateLabel ? `Термін: ${c.dueDateLabel}` : "Без дедлайну"}
                {c.status === "completed" && c.scorePercent != null ? ` · ${c.scorePercent}%` : ""}
              </span>
              {needsAction &&
                (ios ? (
                  <span className="tg-row-note">Відкрийте застосунок CarLS з головного екрана й перейдіть у цей курс.</span>
                ) : (
                  <a className="tg-row-action" href={`/go?to=${encodeURIComponent(courseUrl(c.slug))}`}>
                    Продовжити
                  </a>
                ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ManagerScreen({ name, people }: { name: string; people: TeamPersonRow[] }) {
  const attention = people.filter((p) => p.segment === "overdue" || p.segment === "behind" || p.segment === "not_started");
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function remind(personId: number, reason: string) {
    if (busy) return;
    setBusy(personId);
    try {
      const initData = (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || "";
      const res = await fetch("/api/tg/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, employeeId: personId, reason }),
      });
      if (res.ok) setSent((s) => ({ ...s, [personId]: true }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="tg-head">
        <h1>Привіт, {name.split(" ")[0]}!</h1>
        <p>Команда</p>
      </div>

      {attention.length === 0 ? (
        <div className="tg-summary is-ok">
          <span className="ico">✅</span>
          <span>Уся команда за графіком.</span>
        </div>
      ) : (
        <div className="tg-summary is-attention">
          <span className="ico">⚠️</span>
          <span>{attention.length === 1 ? "1 людина потребує уваги" : `${attention.length} людей потребують уваги`}</span>
        </div>
      )}

      <div className="tg-list">
        {people.map((p) => {
          const cls = p.segment === "overdue" ? "bad" : p.segment === "behind" || p.segment === "not_started" ? "warn" : "ok";
          const needsReminder = p.segment === "overdue" || p.segment === "behind" || p.segment === "not_started";
          return (
            <div className="tg-row" key={p.id}>
              <div className="tg-row-top">
                <span className="tg-row-title">{p.name}</span>
                <span className={`tg-pill ${cls}`}>{p.segmentLabel}</span>
              </div>
              <span className="tg-row-meta">
                {p.positionName || "—"} · складено {p.counts.completed}/{p.counts.total}
              </span>
              {needsReminder && (
                <button
                  type="button"
                  className="tg-row-action"
                  disabled={busy === p.id || sent[p.id]}
                  onClick={() => remind(p.id, p.segment as string)}
                >
                  {sent[p.id] ? "Надіслано ✓" : busy === p.id ? "…" : "Нагадати"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
