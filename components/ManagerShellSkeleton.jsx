import Link from "next/link";
import { HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon, GearIcon, BellIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";
import { PageSkeleton } from "@/components/Skeleton";

const NAV_ITEMS = [
  { href: "/manager", label: "Команда", Icon: HomeIcon },
  { href: "/manager/courses", label: "Курси", Icon: LearnIcon },
  { href: "/manager/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/manager/profile", label: "Профіль", Icon: ProfileIcon },
];

/**
 * Дзеркало HubShellSkeleton.jsx для app/manager/layout.js — той самий
 * привід (аудит "чорний екран", 2026-09-19): ManagerLayout раніше робив
 * ДВА послідовних запити (getCurrentUser + enrollment.findMany) до
 * першого JSX, тепер обидва йдуть у Suspense-обгорнутий гейт, а це —
 * миттєвий каркас на час очікування. hasNewCourses ще невідомий — без
 * бейджа "нове".
 *
 * "Команда" одразу активна (перший пункт NAV_ITEMS = /manager, куди й
 * веде layout за замовчуванням) — на відміну від таббару /hub, тут не
 * потрібен окремий трюк: .mgr-nav-link.active/.tab-btn.active керуються
 * чистим CSS (border/колір), без JS-виміру getBoundingClientRect. Дзвіночок/
 * шестерня — статичні плейсхолдери тієї ж форми (NotificationBell —
 * клієнтський компонент із власним polling, тут потрібна лише форма, щоб
 * apbar/сайдбар не "стрибали" при заміні на справжній shell).
 */
export function ManagerShellSkeleton() {
  return (
    <div className="manager-shell">
      <aside className="mgr-sidebar">
        <div className="mgr-sidebar-brand">
          <PlatformBrand size="lg" />
        </div>
        <div className="mgr-nav-bell">
          <span className="iconbtn ntf-bell" aria-hidden="true">
            <BellIcon />
          </span>
        </div>
        <nav className="mgr-nav">
          {NAV_ITEMS.map(({ href, label, Icon }, i) => (
            <Link key={href} href={href} className={`mgr-nav-link${i === 0 ? " active" : ""}`} title={label} tabIndex={-1}>
              <span className="mgr-nav-icon">
                <Icon filled={i === 0} />
              </span>
              <span className="mgr-nav-label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="mgr-sidebar-footer">
          <span className="iconbtn" aria-hidden="true">
            <GearIcon />
          </span>
        </div>
      </aside>

      <header className="mgr-appbar">
        <PlatformBrand size="sm" />
        <span className="iconbtn ntf-bell" aria-hidden="true">
          <BellIcon />
        </span>
        <span className="iconbtn" aria-hidden="true">
          <GearIcon />
        </span>
      </header>

      <main className="mgr-main">
        <PageSkeleton />
      </main>

      <nav className="tabbar mgr-tabbar" role="tablist" aria-hidden="true">
        {NAV_ITEMS.map(({ href, label, Icon }, i) => (
          <Link key={href} href={href} className={`tab-btn${i === 0 ? " active" : ""}`} role="tab" aria-label={label} tabIndex={-1}>
            <span className="tab-btn-indicator" style={i === 0 ? { background: "var(--cb-primary)" } : undefined}>
              <Icon filled={i === 0} />
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
