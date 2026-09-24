"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon, GearIcon, ChevronIcon, SpinnerIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";
import { NotificationBell } from "@/components/NotificationBell";
import { SettingsSheet } from "@/components/SettingsSheet";
import { usePullToRefresh } from "@/components/usePullToRefresh";

// Згорнутий сайдбар — особиста зручність, localStorage (як в AdminShell).
const SIDEBAR_COLLAPSED_KEY = "manager-sidebar-collapsed";

const NAV_ITEMS = [
  { href: "/manager", label: "Команда", Icon: HomeIcon },
  { href: "/manager/courses", label: "Курси", Icon: LearnIcon },
  { href: "/manager/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/manager/profile", label: "Профіль", Icon: ProfileIcon },
];

// Навігація між вкладками — штатна Next.js (2026-09-22). Раніше тут стояв
// власний SPA-диспетчер (PR #68: перехоплення кліків, pushState, рендер
// ManagerViews/* із lib/clientViewCache) — бо повторний перехід на
// реальному Vercel показував ~1.3с скелетона попри "use cache: private".
// Справжня причина виявилась не в директиві: (1) не був увімкнений парний
// прапорець partialPrefetching (#73), і (2) getCurrentUser() починався з
// `await connection()` — динамічне читання першим рядком кожного page.js,
// на якому App Shell зупинявся (#74). Після цих двох правок штатна
// навігація в /hub дала 17-45мс без скелетона навіть на ПЕРШИЙ захід у
// вкладку (живий замір на Vercel) — диспетчер став зайвим і прибраний.

/**
 * Каркас /manager — та сама 4-вкладкова структура, що в /hub (Команда ~
 * Головна, Курси, Досягнення, Профіль), але навігація адаптивна під
 * десктопний формат кабінету керівника (а не телефонна рамка):
 * - ≥900px (той самий брейкпоінт, що вже використовує .stage у
 *   globals.css для hub/desktop) — постійний сайдбар зліва.
 * - <900px — той самий НИЖНІЙ таббар, що бачать підлеглі в /hub
 *   (.tabbar/.tab-btn з hub.css, та сама розмітка й ті самі іконки,
 *   тепер і та сама капсула-індикатор). Раніше тут був бургер із
 *   nav-шторкою: керівник із телефона діставав розділи в два тапи, тоді
 *   як його ж підлеглі — в один (скарга користувача, 2026-09-19). Вихід
 *   із акаунту переїхав у шторку налаштувань (той самий SettingsSheet,
 *   що й у підлеглих) — не в appbar.
 * Обидві розмітки рендеряться завжди, перемикання — чистим CSS
 * (@media у app/styles/manager.css), без JS-визначення ширини: той
 * самий підхід, що вже використовує .stage (SSR-безпечно, без
 * гідратаційного "стрибка").
 */
/** Маркер «перехід триває» всередині Link (useLinkStatus працює лише в
 *  нащадку Link); стилізує саму вкладку через :has() у CSS. */
function NavPending() {
  const { pending } = useLinkStatus();
  return <span className={`nav-pending${pending ? " is-pending" : ""}`} aria-hidden="true" />;
}

/** «Команда» лишається активною і на drill-down сторінках /manager/team/*
 *  (2026-09-23): вони — підрозділи дашборда, окремого пункту меню не мають. */
function isNavActive(pathname, href) {
  if (href === "/manager") return pathname === "/manager" || pathname.startsWith("/manager/team");
  return pathname === href;
}

export function ManagerShell({ hasNewCourses = false, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tabbarRef = useRef(null);
  const pillRef = useRef(null);
  const tabRefs = useRef(new Map());

  // Без ref — window-режим (/manager скролляться самим вікном, не
  // внутрішньою карткою, як /hub, див. usePullToRefresh.js). Оновлення —
  // дефолтний router.refresh(): {children} тепер завжди справжня поточна
  // сторінка.
  const { pull, threshold } = usePullToRefresh();

  useLayoutEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setCollapsed(true);
    } catch {
      // localStorage недоступний — лишаємось розгорнутими.
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // не критично
      }
      return next;
    });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/register");
    router.refresh();
  }

  // Поки що єдине джерело маркера "нове" — недавно призначені курси, але
  // тримаємо це окремим прапорцем на пункт меню (не просто на "Курси"
  // напряму), щоб згодом легко додати ще один сигнал (напр. зміни в
  // "Команда") без переписування розмітки.
  const navBadges = { "/manager/courses": hasNewCourses };

  // Дефолтний prefetch на <Link> нижче — навмисно: під partialPrefetching
  // це один спільний App Shell на маршрут (не повний пререндер на кожне
  // посилання), і саме він робить перехід миттєвим. prefetch={false} з #72
  // мав сенс лише поки кліки перехоплював SPA-диспетчер — зараз він би
  // вимкнув механізм, на який навігація спирається.
  const navLinks = (
    <nav className="mgr-nav">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`mgr-nav-link${isActive ? " active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            title={label}
          >
            {/* Без червоної крапки на іконці (користувач, 2026-09-24): поруч
                і так стоїть «· нове». У мобільному таббарі нижче крапка
                лишається — там підпису немає, і вона єдиний сигнал. */}
            <span className="mgr-nav-icon">
              <Icon filled={isActive} />
            </span>
            <span className="mgr-nav-label">
              {label}
              {navBadges[href] && <span className="admin-hint"> · нове</span>}
            </span>
            <NavPending />
          </Link>
        );
      })}
    </nav>
  );

  // Капсула під активною вкладкою — той самий прийом, що й components/HubShell.jsx
  // (дзеркальна копія: два окремих компоненти рендерять свій таббар, тож
  // логіка виміру дублюється, а не виноситься в спільний хук — так само,
  // як уже дублюється сама розмітка NAV_ITEMS/TABS). left:0 на .tab-pill
  // в CSS обов'язковий — інакше капсула "тікає" вбік (знайдений раніше
  // баг на прототипі, той самий підводний камінь для будь-якого
  // абсолютно спозиціонованого елемента у flex-контейнері).
  useLayoutEffect(() => {
    const activeHref = NAV_ITEMS.find((t) => isNavActive(pathname, t.href))?.href ?? NAV_ITEMS[0].href;
    const activeEl = tabRefs.current.get(activeHref);
    const pill = pillRef.current;
    const bar = tabbarRef.current;
    if (!activeEl || !pill || !bar) return;
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

  return (
    <div className="manager-shell">
      {/* ---- Десктоп/планшет (≥900px): постійний сайдбар зліва ---- */}
      {/* Згортається до іконок, як адмін-панель (користувач, 2026-09-15);
          блок «ім’я · посада» знизу прибрано — він і так у профілі. */}
      <aside className={`mgr-sidebar${collapsed ? " is-collapsed" : ""}`}>
        <div className="mgr-sidebar-brand">
          <PlatformBrand size="lg" />
        </div>
        {/* Дзвіночок — у тому ж стовпчику, що й іконки розділів, нижче лого. */}
        <div className="mgr-nav-bell">
          <NotificationBell href="/manager/notifications" />
        </div>
        {navLinks}
        <div className="mgr-sidebar-footer">
          {/* Вихід переїхав у шторку налаштувань (той самий SettingsSheet,
              що й у підлеглих у /hub) — там же й розмір тексту, замість
              окремої кнопки-виходу поруч із навігацією (запит користувача,
              2026-09-19: узгодити з тим, як це влаштовано в /hub). */}
          <button type="button" className="iconbtn" title="Налаштування" aria-label="Налаштування" onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </button>
        </div>
        <button
          type="button"
          className="adm-sidebar-collapse-btn"
          title={collapsed ? "Розгорнути панель" : "Згорнути панель"}
          aria-label={collapsed ? "Розгорнути панель" : "Згорнути панель"}
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
        >
          <ChevronIcon />
        </button>
      </aside>

      {/* ---- Мобільний (<900px): верхній appbar ---- */}
      <header className="mgr-appbar">
        <PlatformBrand size="sm" />
        <NotificationBell href="/manager/notifications" />
        <button type="button" className="iconbtn" aria-label="Налаштування" title="Налаштування" onClick={() => setSettingsOpen(true)}>
          <GearIcon />
        </button>
      </header>

      <main className="mgr-main">
        <div className="ptr-indicator" style={{ height: pull, opacity: Math.min(1, pull / threshold) }} aria-hidden="true">
          <SpinnerIcon />
        </div>
        {children}
      </main>

      {/* ---- Мобільний (<900px): нижній таббар, той самий, що в /hub ---- */}
      <nav className="tabbar mgr-tabbar" role="tablist" ref={tabbarRef}>
        <span className="tab-pill" ref={pillRef} aria-hidden="true" />
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = isNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`tab-btn${isActive ? " active" : ""}`}
              role="tab"
              aria-label={navBadges[href] ? `${label} (є нові)` : label}
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              title={label}
            >
              <span className="tab-btn-indicator" ref={(el) => { if (el) tabRefs.current.set(href, el); else tabRefs.current.delete(href); }}>
                <Icon filled={isActive} />
                {navBadges[href] && <span className="mgr-nav-dot" aria-hidden="true" />}
              </span>
              <NavPending />
            </Link>
          );
        })}
      </nav>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onLogout={handleLogout} />
    </div>
  );
}
