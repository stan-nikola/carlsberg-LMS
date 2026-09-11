"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon, LogoutIcon } from "@/components/icons";
import { PLATFORM_SHORT_NAME, PLATFORM_TAGLINE_SHORT, PLATFORM_ABBREVIATION_EXPANSION } from "@/lib/branding";

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
          >
            <span className="mgr-nav-icon">
              <Icon filled={isActive} />
              {navBadges[href] && <span className="mgr-nav-dot" aria-hidden="true" />}
            </span>
            <span>
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
      <aside className="mgr-sidebar">
        <div className="mgr-sidebar-brand">
          {PLATFORM_SHORT_NAME}
          <span className="mgr-sidebar-brand-full">{PLATFORM_ABBREVIATION_EXPANSION}</span>
        </div>
        {navLinks()}
        <div className="mgr-sidebar-footer">
          <div className="mgr-sidebar-user">
            <span className="manager-topbar-name">{employee.name}</span>
            <span className="admin-hint">{employee.position?.name || "Керівник"}</span>
          </div>
          <button type="button" className="admin-btn-link" onClick={handleLogout}>
            Вийти
          </button>
        </div>
      </aside>

      {/* ---- Мобільний (<900px): верхній appbar + бургер + шторка ---- */}
      <header className="mgr-appbar">
        <span className="admin-topbar-title">
          <span className="admin-topbar-title-full">{PLATFORM_TAGLINE_SHORT}</span>
          <span className="admin-topbar-title-short">
            {PLATFORM_SHORT_NAME}
            <span className="mgr-sidebar-brand-full">{PLATFORM_ABBREVIATION_EXPANSION}</span>
          </span>
        </span>
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
