"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CourseIcon, PeopleIcon, AchievementsIcon, LogoutIcon } from "@/components/icons";

// match — не проста рівність href, а й піддерева: /admin/courses/[id]
// (редактор курсу) належить пункту "Курси", /admin/employees/[id]
// (картка людини) — пункту "Співробітники". Для кореня "/admin" рівно
// pathname==="/admin" НЕ підійшло б для .../courses/... — тому в нього
// власна перевірка на префікс courses.
const NAV_ITEMS = [
  { href: "/admin", label: "Курси", Icon: CourseIcon, match: (p) => p === "/admin" || p.startsWith("/admin/courses") },
  { href: "/admin/employees", label: "Співробітники", Icon: PeopleIcon, match: (p) => p.startsWith("/admin/employees") },
  { href: "/admin/badges", label: "Ачивки", Icon: AchievementsIcon, match: (p) => p.startsWith("/admin/badges") },
];

/**
 * Каркас /admin — єдиний дашборд із сайдбар-навігацією замість колишнього
 * плоского топбару (лише 3 текстові лінки без іконок, без активного
 * стану). Той самий адаптивний патерн, що вже є в /manager
 * (components/ManagerShell.jsx): постійний сайдбар зліва на ≥900px,
 * верхній appbar + бургер-шторка на вужчих екранах — обидві розмітки
 * рендеряться завжди, перемикання чистим CSS (@media в admin.css),
 * без JS-визначення ширини (SSR-безпечно). На відміну від /manager —
 * без PlatformBrand (адмінка — внутрішній інструмент, не екран
 * співробітника) і без --fs-scale скидання (тут його й так ніде нема).
 */
export function AdminShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  // full-bleed для /admin — скидання body-центрування/padding/градієнта
  // (розраховані на телефонну .course-card) робиться ЧИСТИМ CSS
  // (body:has(.adm-shell) в admin.css), не через useEffect: клас на body,
  // виставлений у useEffect, з'являється лише ПІСЛЯ гідратації — на
  // повільнішому завантаженні (Завантаження… на /admin/courses) це давало
  // помітний "стрибок": спершу сторінка малювалась у старій вузькій рамці
  // з градієнтом, і лише за мить перемальовувалась у full-bleed.
  // :has() рахується разу ж під час computed style, без затримки на JS.

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const navLinks = (onNavigate) => (
    <nav className="adm-nav">
      {NAV_ITEMS.map(({ href, label, Icon, match }) => {
        const isActive = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className={`adm-nav-link${isActive ? " active" : ""}`}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="adm-nav-icon">
              <Icon />
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="adm-shell">
      {/* ---- Десктоп/планшет (≥900px): постійний сайдбар зліва ---- */}
      <aside className="adm-sidebar">
        <Link href="/admin" className="adm-sidebar-title">
          Адмін-панель
        </Link>
        {navLinks()}
        <div className="adm-sidebar-footer">
          <button type="button" className="iconbtn" title="Вийти" aria-label="Вийти" onClick={handleLogout}>
            <LogoutIcon />
          </button>
        </div>
      </aside>

      {/* ---- Мобільний (<900px): верхній appbar + бургер + шторка ---- */}
      <header className="adm-appbar">
        <Link href="/admin" className="adm-sidebar-title">
          Адмін-панель
        </Link>
        <button
          type="button"
          className="adm-burger-btn"
          aria-label="Меню розділів"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <div
        className={`sheet-overlay adm-nav-sheet-overlay${navOpen ? " open" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) setNavOpen(false);
        }}
      >
        <div className="sheet adm-nav-sheet">
          <div className="sheet-handle" />
          {navLinks(() => setNavOpen(false))}
          <button type="button" className="logout-row" onClick={handleLogout}>
            <LogoutIcon />
            <span>Вийти</span>
          </button>
        </div>
      </div>

      <main className="adm-main">{children}</main>
    </div>
  );
}
