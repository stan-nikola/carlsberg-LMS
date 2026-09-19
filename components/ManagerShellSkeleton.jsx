import Link from "next/link";
import { HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";
import { PageSkeleton } from "@/components/Skeleton";

const NAV_ITEMS = [
  { href: "/manager", label: "Команда", Icon: HomeIcon },
  { href: "/manager/courses", label: "Курси", Icon: LearnIcon },
  { href: "/manager/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/manager/profile", label: "Профіль", Icon: ProfileIcon },
];

/** Дзеркало HubShellSkeleton.jsx для app/manager/layout.js — той самий
 *  привід (аудит "чорний екран", 2026-09-19): ManagerLayout раніше робив
 *  ДВА послідовних запити (getCurrentUser + enrollment.findMany) до
 *  першого JSX, тепер обидва йдуть у Suspense-обгорнутий гейт, а це —
 *  миттєвий каркас на час очікування. hasNewCourses ще невідомий —
 *  без бейджа "нове". */
export function ManagerShellSkeleton() {
  return (
    <div className="manager-shell">
      <aside className="mgr-sidebar">
        <div className="mgr-sidebar-brand">
          <PlatformBrand size="lg" />
        </div>
        <nav className="mgr-nav">
          {NAV_ITEMS.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="mgr-nav-link" title={label} tabIndex={-1}>
              <span className="mgr-nav-icon">
                <Icon />
              </span>
              <span className="mgr-nav-label">{label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <header className="mgr-appbar">
        <PlatformBrand size="sm" />
      </header>

      <main className="mgr-main">
        <PageSkeleton />
      </main>

      <nav className="tabbar mgr-tabbar" role="tablist" aria-hidden="true">
        {NAV_ITEMS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="tab-btn" role="tab" aria-label={label} tabIndex={-1}>
            <span className="tab-btn-indicator">
              <Icon />
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
