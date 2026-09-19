"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon, LogoutIcon, ChevronIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";
import { NotificationBell } from "@/components/NotificationBell";

// Згорнутий сайдбар — особиста зручність, localStorage (як в AdminShell).
const SIDEBAR_COLLAPSED_KEY = "manager-sidebar-collapsed";

const NAV_ITEMS = [
  { href: "/manager", label: "Команда", Icon: HomeIcon },
  { href: "/manager/courses", label: "Курси", Icon: LearnIcon },
  { href: "/manager/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/manager/profile", label: "Профіль", Icon: ProfileIcon },
];

/**
 * Каркас /manager — та сама 4-вкладкова структура, що в /hub (Команда ~
 * Головна, Курси, Досягнення, Профіль), але навігація адаптивна під
 * десктопний формат кабінету керівника (а не телефонна рамка):
 * - ≥900px (той самий брейкпоінт, що вже використовує .stage у
 *   globals.css для hub/desktop) — постійний сайдбар зліва.
 * - <900px — той самий НИЖНІЙ таббар, що бачать підлеглі в /hub
 *   (.tabbar/.tab-btn з hub.css, та сама розмітка й ті самі іконки).
 *   Раніше тут був бургер із nav-шторкою: керівник із телефона діставав
 *   розділи в два тапи, тоді як його ж підлеглі — в один (скарга
 *   користувача, 2026-09-19). Вихід із акаунту переїхав у сам appbar —
 *   він був єдиним, крім навігації, що жило в тій шторці.
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
  useEffect(() => {
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

  const navLinks = (
    <nav className="mgr-nav">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
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
          <button type="button" className="iconbtn" title="Вийти" aria-label="Вийти" onClick={handleLogout}>
            <LogoutIcon />
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
        <button type="button" className="iconbtn" aria-label="Вийти" title="Вийти" onClick={handleLogout}>
          <LogoutIcon />
        </button>
      </header>

      <main className="mgr-main">{children}</main>

      {/* ---- Мобільний (<900px): нижній таббар, той самий, що в /hub ---- */}
      <nav className="tabbar mgr-tabbar" role="tablist">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
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
              <span className="tab-btn-indicator">
                <Icon filled={isActive} />
                {navBadges[href] && <span className="mgr-nav-dot" aria-hidden="true" />}
              </span>
              <NavPending />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
