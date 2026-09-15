"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
 * - <900px — верхній appbar з бургер-кнопкою праворуч, що відкриває
 *   nav-шторку (той самий .sheet-overlay/.sheet патерн, що й
 *   SettingsSheet — тут той самий, лише зі списком розділів замість
 *   налаштувань).
 * Обидві розмітки рендеряться завжди, перемикання — чистим CSS
 * (@media у app/styles/manager.css), без JS-визначення ширини: той
 * самий підхід, що вже використовує .stage (SSR-безпечно, без
 * гідратаційного "стрибка").
 */
export function ManagerShell({ employee, hasNewCourses = false, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
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
  const hasAnyBadge = Object.values(navBadges).some(Boolean);

  const navLinks = (onNavigate) => (
    <nav className="mgr-nav">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`mgr-nav-link${isActive ? " active" : ""}`}
            onClick={onNavigate}
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
        {navLinks()}
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

      {/* ---- Мобільний (<900px): верхній appbar + бургер + шторка ---- */}
      <header className="mgr-appbar">
        <PlatformBrand size="sm" />
        <NotificationBell href="/manager/notifications" />
        <button
          type="button"
          className="mgr-burger-btn"
          aria-label={hasAnyBadge ? "Меню розділів (є нові)" : "Меню розділів"}
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <span />
          <span />
          <span />
          {hasAnyBadge && <span className="mgr-nav-dot mgr-burger-dot" aria-hidden="true" />}
        </button>
      </header>

      <div
        className={`sheet-overlay mgr-nav-sheet-overlay${navOpen ? " open" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) setNavOpen(false);
        }}
      >
        <div className="sheet mgr-nav-sheet">
          <div className="sheet-handle" />
          <div className="mgr-nav-sheet-user">
            <span className="manager-topbar-name">{employee.name}</span>
            <span className="admin-hint">{employee.position?.name || "Керівник"}</span>
          </div>
          {navLinks(() => setNavOpen(false))}
          <button type="button" className="logout-row" onClick={handleLogout}>
            <LogoutIcon />
            <span>Вийти з акаунту</span>
          </button>
        </div>
      </div>

      <main className="mgr-main">{children}</main>
    </div>
  );
}
