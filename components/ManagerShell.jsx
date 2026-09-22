"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon, GearIcon, ChevronIcon, SpinnerIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";
import { NotificationBell } from "@/components/NotificationBell";
import { SettingsSheet } from "@/components/SettingsSheet";
import { usePullToRefresh } from "@/components/usePullToRefresh";
import { clearCachedView } from "@/lib/clientViewCache";
import { TeamView } from "@/components/ManagerViews/TeamView";
import { CoursesView } from "@/components/ManagerViews/CoursesView";
import { AchievementsView } from "@/components/ManagerViews/AchievementsView";
import { ProfileView } from "@/components/ManagerViews/ProfileView";
import { NotificationsView } from "@/components/ManagerViews/NotificationsView";

// Згорнутий сайдбар — особиста зручність, localStorage (як в AdminShell).
const SIDEBAR_COLLAPSED_KEY = "manager-sidebar-collapsed";

const NAV_ITEMS = [
  { href: "/manager", label: "Команда", Icon: HomeIcon },
  { href: "/manager/courses", label: "Курси", Icon: LearnIcon },
  { href: "/manager/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/manager/profile", label: "Профіль", Icon: ProfileIcon },
];

// Клієнтський диспетчер вкладок (аудит "вообще без скелетонов мгновенно",
// 2026-09-20): на реальному Vercel повторна Next.js-навігація на /manager/*
// однаково йшла на сервер щоразу (живий замір DOM-поллінгом на проді
// показав ~1.3-1.5с скелетона на РЕПІТ-переході, попри "use cache: private"
// — задокументована поведінка директиви на практиці не підтвердилась).
// Ці 5 маршрутів перехоплюються тут і рендеряться клієнтським компонентом
// із власного кешу (lib/clientViewCache.js) замість справжнього переходу
// Next.js — перше відвідування кожного цього сеансу все одно йде в мережу
// (SeedViewCache у відповідному page.js), повторне — миттєво з кешу.
// Усі ІНШІ посилання (плеєр курсу, картка людини тощо) не займаються.
const VIEW_COMPONENTS = {
  "/manager": TeamView,
  "/manager/courses": CoursesView,
  "/manager/achievements": AchievementsView,
  "/manager/profile": ProfileView,
  "/manager/notifications": NotificationsView,
};

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

export function ManagerShell({ hasNewCourses = false, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tabbarRef = useRef(null);
  const pillRef = useRef(null);
  const tabRefs = useRef(new Map());
  // null — показуємо справжню {children} (SSR-заход/F5 на поточний
  // pathname). Непорожнє — клієнтський перехід: рендеримо відповідний
  // ManagerViews/* із власного кешу, URL міняємо самі (pushState), Next.js
  // Router про цю "навігацію" не знає навмисно.
  const [clientView, setClientView] = useState(null);
  // Форсує ремонт View-компонента при pull-to-refresh (нижче) — інакше
  // useViewData не переопитає дані, побачивши, що кеш просто зник.
  const [viewNonce, setViewNonce] = useState(0);
  const activePath = clientView ?? pathname;

  useEffect(() => {
    function onPopState() {
      const p = window.location.pathname;
      setClientView(VIEW_COMPONENTS[p] ? p : null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function handleShellClick(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
    const anchor = e.target.closest("a[href]");
    if (!anchor) return;
    let url;
    try {
      url = new URL(anchor.href, window.location.origin);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin || !VIEW_COMPONENTS[url.pathname]) return;
    e.preventDefault();
    if (url.pathname === activePath) return;
    window.history.pushState(null, "", url.pathname + url.search);
    setClientView(url.pathname);
  }

  // pull-to-refresh на клієнтській вкладці мав би оновити ЇЇ, не застарілу
  // {children} з першого SSR-заходу (router.refresh() лишається дефолтом,
  // коли clientView===null — там {children} і так справжня поточна
  // сторінка).
  //
  // useCallback обов'язковий: usePullToRefresh тримає onRefresh у
  // залежностях свого ефекту, що вішає touchstart/move/end. Без useCallback
  // ця функція — нове посилання на КОЖЕН рендер ManagerShell, ефект
  // перевішувався б і посеред самого жесту протягування — локальні
  // startY/pulling/currentPull (замикання всередині ефекту) губились, і
  // спінер "ламався"/картка схлопувалась на півдорозі (скарга користувача,
  // перевірка на телефоні, 2026-09-20).
  const handleRefresh = useCallback(() => {
    if (!clientView) return router.refresh();
    clearCachedView(clientView);
    setViewNonce((n) => n + 1);
    return undefined;
  }, [clientView, router]);

  // Без ref — window-режим (/manager скролляться самим вікном, не
  // внутрішньою карткою, як /hub, див. usePullToRefresh.js).
  const { pull, threshold } = usePullToRefresh(undefined, handleRefresh);

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

  // prefetch={false} на обох таббарах нижче (десктопний сайдбар і мобільний
  // низ) — handleShellClick вище перехоплює клік на КОЖЕН із цих маршрутів
  // через preventDefault і сам робить pushState/клієнтський рендер
  // (SPA-диспетчер, PR #68); справжній Next.js Link-перехід із цих <Link>
  // НІКОЛИ не відбувається, тож і його автопрефетч RSC-пейлоаду (за
  // замовчуванням — щойно посилання в'їжджає у viewport) — мертвий
  // вантаж. Заміряно на прод-збірці (2026-09-22): один заход на /manager
  // давав 8 префетч-запитів — по 4 маршрути × 2, бо сайдбар і таббар
  // рендеряться ОБИДВА (перемикає їх лише CSS), і кожен запит іде на
  // сервер зі своєю порцією запитів до Neon паралельно з головним.
  const navLinks = (
    <nav className="mgr-nav">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = activePath === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className={`mgr-nav-link${isActive ? " active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            title={label}
          >
            <span className="mgr-nav-icon">
              <Icon filled={isActive} />
              {navBadges[href] && <span className="mgr-nav-dot" aria-hidden="true" />}
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
    const activeHref = NAV_ITEMS.find((t) => activePath === t.href)?.href ?? NAV_ITEMS[0].href;
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
  }, [activePath]);

  const ClientViewComponent = clientView ? VIEW_COMPONENTS[clientView] : null;

  return (
    <div className="manager-shell" onClickCapture={handleShellClick}>
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
        {ClientViewComponent ? <ClientViewComponent key={viewNonce} /> : children}
      </main>

      {/* ---- Мобільний (<900px): нижній таббар, той самий, що в /hub ---- */}
      <nav className="tabbar mgr-tabbar" role="tablist" ref={tabbarRef}>
        <span className="tab-pill" ref={pillRef} aria-hidden="true" />
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = activePath === href;
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
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
