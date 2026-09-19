import Link from "next/link";
import { GearIcon, HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";
import { PageSkeleton } from "@/components/Skeleton";

const TABS = [
  { href: "/hub", label: "Головна", Icon: HomeIcon },
  { href: "/hub/learn", label: "Навчання", Icon: LearnIcon },
  { href: "/hub/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/hub/profile", label: "Профіль", Icon: ProfileIcon },
];

/**
 * Suspense-фолбек у app/hub/layout.js на час, поки резолвиться
 * getCurrentUser() (аудит "чорний екран на холодному старті", 2026-09-19):
 * без цього layout.js сам був async-компонентом, що чекав сесію/БД ДО
 * повернення будь-якого JSX — ні appbar, ні tabbar, ні навіть PageSkeleton
 * не встигали домалюватись, і на холодному запуску PWA (Vercel-функція +
 * Neon щойно прокинулись) екран лишався порожнім на кілька секунд.
 * Та сама розмітка/класи, що й у HubShell.jsx — щоб заміна на справжній
 * shell не викликала стрибка макета. isAdmin/активна вкладка ще невідомі
 * (сесія не резолвнута) — іконка адмінки прихована, вкладки без active/
 * капсули-індикатора.
 */
export function HubShellSkeleton() {
  return (
    <div className="stage stage--hub">
      <div className="course-col">
        <div className="course-card">
          <div className="appbar">
            <PlatformBrand size="sm" />
          </div>

          <div className="hub-viewport">
            <PageSkeleton />
          </div>

          <nav className="tabbar" role="tablist" aria-hidden="true">
            {TABS.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="tab-btn" role="tab" aria-label={label} tabIndex={-1}>
                <span className="tab-btn-indicator">
                  <Icon />
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
