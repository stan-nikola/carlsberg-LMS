"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SettingsSheet } from "@/components/SettingsSheet";
import { GearIcon, LockIcon, HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon, SpinnerIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";
import { NotificationBell } from "@/components/NotificationBell";
import { usePullToRefresh } from "@/components/usePullToRefresh";

const TABS = [
  { href: "/hub", label: "Головна", Icon: HomeIcon },
  { href: "/hub/learn", label: "Навчання", Icon: LearnIcon },
  { href: "/hub/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/hub/profile", label: "Профіль", Icon: ProfileIcon },
];

/**
 * Каркас хаба: appbar + settings sheet + tabbar з реальними роутами
 * (замість перемикання .hub-screen.active, як у legacy index.html).
 * Дані сотрудника отримує layout (Server Component) і сюди не потрібні —
 * логаут працює через сесію-cookie на сервері.
 */
/** Маркер «перехід триває» всередині Link (useLinkStatus працює лише в
 *  нащадку Link); стилізує саму вкладку через :has() у CSS. */
function NavPending() {
  const { pending } = useLinkStatus();
  return <span className={`nav-pending${pending ? " is-pending" : ""}`} aria-hidden="true" />;
}

export function HubShell({ children, isAdmin = false }) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Прокрутка шестерні на клік (2026-09-22, рішення користувача) — той
  // самий "спалахнути й повернутись" прийом, що й .ntf-bell.is-ringing.
  const [gearSpinning, setGearSpinning] = useState(false);
  const gearSpinTimeoutRef = useRef(null);
  function spinGear() {
    setSettingsOpen(true);
    setGearSpinning(true);
    clearTimeout(gearSpinTimeoutRef.current);
    gearSpinTimeoutRef.current = setTimeout(() => setGearSpinning(false), 500);
  }
  const viewportRef = useRef(null);
  const tabbarRef = useRef(null);
  const pillRef = useRef(null);
  const tabRefs = useRef(new Map());
  const { pull, threshold } = usePullToRefresh(viewportRef);

  // Капсула під активною вкладкою їде й змінює розмір замість того, щоб
  // кожна вкладка мала власну заливку, що просто з'являється/зникає на
  // місці (рішення користувача 2026-09-19: той самий рух, що вже
  // перевірений на бенчі — components/ManagerShell.jsx дзеркалить цю ж
  // логіку 1:1, і той самий підводний камінь: без left:0 на .tab-pill
  // абсолютно спозиціонований елемент усередині flex-контейнера сам
  // вираховує "статичну позицію" за алгоритмом flex-розкладки, і
  // translateX рахується не від нуля — капсула "тікає" вбік). Форма —
  // не заокруглена капсула, а той самий --radius-btn, що й .tab-btn-
  // indicator мав завжди: фірмовий прямокутний язик Malty (задокументовано
  // нижче в CSS), лише тепер механіка "їде", а не "з'являється на місці".
  useLayoutEffect(() => {
    // pathname поза TABS (напр. /hub/notifications — дзвоник у appbar веде
    // туди, це не вкладка таббару) раніше "?? TABS[0].href" тихо підставляв
    // Home, і капсула лишалась зеленою під Home, хоч користувач фактично на
    // екрані сповіщень — сховати капсулу зовсім, а не вдавати активну вкладку.
    const activeTab = TABS.find((t) => pathname === t.href);
    const pill = pillRef.current;
    const bar = tabbarRef.current;
    if (!pill || !bar) return;
    if (!activeTab) {
      pill.style.opacity = "0";
      return;
    }
    pill.style.opacity = "1";
    const activeEl = tabRefs.current.get(activeTab.href);
    if (!activeEl) return;
    const move = () => {
      const barRect = bar.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      pill.style.width = elRect.width + "px";
      pill.style.height = elRect.height + "px";
      pill.style.transform = `translate(${elRect.left - barRect.left}px, ${elRect.top - barRect.top}px)`;
    };
    move();
    window.addEventListener("resize", move);
    return () => window.removeEventListener("resize", move);
  }, [pathname]);

  // Перехід між вкладками — це client-side навігація всередині ОДНОГО й
  // того самого внутрішнього скрол-контейнера (.hub-viewport), а не окрема
  // сторінка з власним скролом: Next.js скидає лише window-скрол, про цей
  // контейнер він не знає. Без цього, якщо попередній екран був
  // прогорнутий вниз (напр. довгий блок "від колег"), новий відкривався
  // вже "з середини" — верх нового екрана виглядав обрізаним.
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => () => clearTimeout(gearSpinTimeoutRef.current), []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/register");
    router.refresh();
  }

  return (
    <div className="stage stage--hub">
      <div className="course-col">
        <div className="course-card">
          <div className="appbar">
            <PlatformBrand size="sm" />
            {isAdmin && (
              <Link className="iconbtn" aria-label="Адмін-панель" href="/admin">
                <LockIcon />
              </Link>
            )}
            <NotificationBell href="/hub/notifications" />
            <button
              className={`iconbtn${gearSpinning ? " is-spinning" : ""}`}
              aria-label="Налаштування"
              onClick={spinGear}
            >
              <GearIcon />
            </button>
          </div>

          <div className="hub-viewport" ref={viewportRef}>
            <div className="ptr-indicator" style={{ height: pull, opacity: Math.min(1, pull / threshold) }} aria-hidden="true">
              <SpinnerIcon />
            </div>
            {children}
          </div>

          <nav className="tabbar" role="tablist" ref={tabbarRef}>
            <span className="tab-pill" ref={pillRef} aria-hidden="true" />
            {TABS.map(({ href, label, Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`tab-btn${isActive ? " active" : ""}`}
                  role="tab"
                  aria-label={label}
                  aria-selected={isActive}
                  title={label}
                >
                  <span className="tab-btn-indicator" ref={(el) => { if (el) tabRefs.current.set(href, el); else tabRefs.current.delete(href); }}>
                    <Icon filled={isActive} />
                  </span>
                  <NavPending />
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onLogout={handleLogout} />
    </div>
  );
}
