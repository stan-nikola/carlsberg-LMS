"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CourseIcon, PeopleIcon, AchievementsIcon, LogoutIcon, ChevronIcon, RootIcon, DataIcon, BellIcon, TrendIcon, ClockIcon } from "@/components/icons";

// Ключ localStorage для згорнутого стану сайдбара — суто персональна
// зручність адміна (не дані курсу/бази), тому localStorage, а не БД.
const SIDEBAR_COLLAPSED_KEY = "admin-sidebar-collapsed";

// match — не проста рівність href, а й піддерева: /admin/courses/[id]
// (редактор курсу) належить пункту "Курси", /admin/employees/[id]
// (картка людини) — пункту "Співробітники". Для кореня "/admin" рівно
// pathname==="/admin" НЕ підійшло б для .../courses/... — тому в нього
// власна перевірка на префікс courses.
const NAV_ITEMS = [
  { href: "/admin", label: "Курси", Icon: CourseIcon, match: (p) => p === "/admin" || p.startsWith("/admin/courses") },
  { href: "/admin/employees", label: "Співробітники", Icon: PeopleIcon, match: (p) => p.startsWith("/admin/employees") },
  // Оргструктура й Дані — колишні вкладки «Дерево» та «Excel (жива книга)»
  // на /admin/employees. Це не інші вигляди списку людей, а окремі
  // інструменти (переприв'язка керівників; імпорт/експорт/жива книга) —
  // тому власні пункти, а не перемикач усередині сторінки.
  { href: "/admin/org", label: "Оргструктура", Icon: RootIcon, match: (p) => p.startsWith("/admin/org") },
  { href: "/admin/badges", label: "Ачивки", Icon: AchievementsIcon, match: (p) => p.startsWith("/admin/badges") },
  { href: "/admin/data", label: "Дані", Icon: DataIcon, match: (p) => p.startsWith("/admin/data") },
  { href: "/admin/notifications", label: "Сповіщення", Icon: BellIcon, match: (p) => p.startsWith("/admin/notifications") },
  { href: "/admin/rating", label: "Рейтинг", Icon: TrendIcon, match: (p) => p.startsWith("/admin/rating") },
  { href: "/admin/audit", label: "Журнал", Icon: ClockIcon, match: (p) => p.startsWith("/admin/audit") },
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
  // Згорнутий (лише іконки) десктопний сайдбар — за проханням користувача,
  // щоб звільнити ширину вьюпорту під конструктор курсу й прев'ю на
  // пристрої (.admin-editor-grid). false на першому рендері (SSR-безпечно,
  // localStorage тут недоступний) — реальне збережене значення підхоплює
  // useEffect нижче; можливий короткий "спалах" розгорнутого стану на
  // перших мілісекундах для адміна, який раніше згорнув панель, — прийнятна
  // ціна за єдине SSR-безпечне джерело правди без flash-of-wrong-layout на
  // КОЖНОМУ завантаженні (на відміну від body-класу для full-bleed вище,
  // де jump стосувався б усіх, а не лише тих, хто змінив налаштування).
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Читаємо localStorage один раз при монтуванні — lazy useState-
    // ініціалізатор тут не підходить: компонент рендериться і на сервері
    // (SSR), де localStorage відсутній (той самий випадок, що вже є в
    // SettingsSheet.jsx для --fs-scale).
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setCollapsed(true);
    } catch {
      // localStorage недоступний (приватний режим тощо) — лишаємось розгорнутими.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Не критично — просто не запам'ятається між сесіями.
      }
      return next;
    });
  }

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
            // title — підказка при наведенні: у згорнутому десктопному
            // сайдбарі текстовий span ховається CSS-ом, лишається саме
            // іконка, і без title розпізнати пункт можна лише "на око".
            title={label}
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
      {/* ---- Десктоп/планшет (≥900px): постійний сайдбар зліва ----
          is-collapsed — лише іконки, звужує колонку зі 190px до 56px,
          щоб звільнити ширину під конструктор курсу/прев'ю на пристрої
          (за проханням користувача). */}
      <aside className={`adm-sidebar${collapsed ? " is-collapsed" : ""}`}>
        <Link href="/admin" className="adm-sidebar-title" title="Адмін-панель">
          <span className="adm-sidebar-title-text">Адмін-панель</span>
        </Link>
        {navLinks()}
        <div className="adm-sidebar-footer">
          <button type="button" className="iconbtn" title="Вийти" aria-label="Вийти" onClick={handleLogout}>
            <LogoutIcon />
          </button>
        </div>
        {/* Кнопка згортання — НЕ в один рядок із заголовком (там вона
            накладалась на напис "Адмін-панель", реальний баг, знайдений
            користувачем), а абсолютно позиційована рівно по вертикальному
            центру всієї панелі, просто на лінії border-right (.adm-sidebar
            вже position:sticky — це теж containing block для абсолюта, як
            і relative/fixed, окремого position:relative не треба). Без
            .iconbtn (без рамки/фону в стані спокою — "без контейнера") —
            гола іконка-кнопка "плаває" прямо на межі колонки. */}
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
