"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GearIcon, ChevronIcon, SpinnerIcon } from "@/components/icons";
import { MANAGER_NAV as NAV_ITEMS, isManagerNavActive as isNavActive } from "@/components/shellNav";
import { PlatformBrand } from "@/components/PlatformBrand";
import { NotificationBell } from "@/components/NotificationBell";
import { SettingsSheet } from "@/components/SettingsSheet";
import { usePullToRefresh } from "@/components/usePullToRefresh";
import { NavPending, logout, useShellEffects, useTabPill } from "@/components/shellCommon";

// Згорнутий сайдбар — особиста зручність, localStorage (як в AdminShell).
const SIDEBAR_COLLAPSED_KEY = "manager-sidebar-collapsed";

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
 * «Головна» хабу, Курси, Досягнення, Профіль), але навігація адаптивна під
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
export function ManagerShell({ hasNewCourses = false, children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Без ref — window-режим (/manager скролляться самим вікном, не
  // внутрішньою карткою, як /hub, див. usePullToRefresh.js). Оновлення —
  // дефолтний router.refresh(): {children} тепер завжди справжня поточна
  // сторінка.
  const { pull, threshold } = usePullToRefresh();

  useShellEffects("manager");
  // Сторінка поза вкладками (сповіщення з дзвоника) — капсулу ховаємо.
  const { tabbarRef, pillRef, tabRef } = useTabPill(NAV_ITEMS.find((t) => isNavActive(pathname, t.href))?.href);

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

  // Поки що єдине джерело маркера "нове" — недавно призначені курси, але
  // тримаємо це окремим прапорцем на пункт меню (не просто на "Курси"
  // напряму), щоб згодом легко додати ще один сигнал (напр. зміни в
  // "Головна") без переписування розмітки.
  const navBadges = { "/manager/courses": hasNewCourses };

  // Рамка активного пункту сайдбара — ОДНА (.mgr-nav-pill), що їде до
  // натиснутого пункту, як кільце в методичці (CourseReview positionRing) і
  // капсула мобільного таббару нижче (користувач, 2026-10-04). Їде одразу з
  // кліку, не чекаючи, поки сторінка завантажиться; після навігації
  // layout-ефект ставить її на справжній активний пункт. offsetTop/-Width
  // відносно .mgr-nav (position:relative) — та сама схема, що в методичці.
  const sideNavRef = useRef(null);
  const sidePillRef = useRef(null);
  const sideLinkRefs = useRef(new Map());
  function moveSidePill(link, snap = false) {
    const pill = sidePillRef.current;
    if (!pill) return;
    pill.style.opacity = link ? "1" : "0";
    if (!link) return;
    if (snap) pill.style.transition = "none";
    pill.style.width = link.offsetWidth + "px";
    pill.style.height = link.offsetHeight + "px";
    pill.style.transform = `translate(${link.offsetLeft}px, ${link.offsetTop}px)`;
    if (snap) {
      void pill.offsetWidth; // застосувати без transition, потім повернути його
      pill.style.transition = "";
    }
  }
  useLayoutEffect(() => {
    const activeHref = NAV_ITEMS.find((t) => isNavActive(pathname, t.href))?.href;
    const link = activeHref ? sideLinkRefs.current.get(activeHref) : null;
    moveSidePill(link);
    if (!link) return;
    // Згортання панелі анімує ширину пунктів — рамка йде слідом без пружини.
    const ro = new ResizeObserver(() => moveSidePill(link, true));
    ro.observe(link);
    return () => ro.disconnect();
  }, [pathname]);

  // Дефолтний prefetch на <Link> нижче — навмисно: під partialPrefetching
  // це один спільний App Shell на маршрут (не повний пререндер на кожне
  // посилання), і саме він робить перехід миттєвим. prefetch={false} з #72
  // мав сенс лише поки кліки перехоплював SPA-диспетчер — зараз він би
  // вимкнув механізм, на який навігація спирається.
  const navLinks = (
    <nav className="mgr-nav" ref={sideNavRef}>
      <span className="mgr-nav-pill" ref={sidePillRef} aria-hidden="true" />
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            ref={(el) => { if (el) sideLinkRefs.current.set(href, el); else sideLinkRefs.current.delete(href); }}
            onClick={(e) => moveSidePill(e.currentTarget)}
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

  return (
    <div className="manager-shell">
      {/* ---- Десктоп/планшет (≥900px): постійний сайдбар зліва ---- */}
      {/* Згортається до іконок, як адмін-панель (користувач, 2026-09-15);
          блок «ім’я · посада» знизу прибрано — він і так у профілі. */}
      <aside className={`mgr-sidebar${collapsed ? " is-collapsed" : ""}`}>
        <div className="mgr-sidebar-brand">
          <PlatformBrand size="lg" href="/manager" />
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
        <PlatformBrand size="sm" href="/manager" />
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
              <span className="tab-btn-indicator" ref={tabRef(href)}>
                <Icon filled={isActive} />
                {navBadges[href] && <span className="mgr-nav-dot" aria-hidden="true" />}
              </span>
              <NavPending />
            </Link>
          );
        })}
      </nav>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onLogout={logout} />
    </div>
  );
}
