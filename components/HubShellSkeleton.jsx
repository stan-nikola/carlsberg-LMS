import Link from "next/link";
import { GearIcon, BellIcon, HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";
import { HubHomeSkeleton } from "@/components/HubHomeSkeleton";

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
 * повернення будь-якого JSX — ні appbar, ні tabbar, ні навіть скелетон
 * не встигали домалюватись, і на холодному запуску PWA (Vercel-функція +
 * Neon щойно прокинулись) екран лишався порожнім на кілька секунд.
 * Та сама розмітка/класи, що й у HubShell.jsx — щоб заміна на справжній
 * shell не викликала стрибка макета. isAdmin/активна вкладка ще невідомі
 * (сесія не резолвнута) — іконка адмінки прихована, вкладки без active/
 * капсули-індикатора. Контент — HubHomeSkeleton (не універсальний
 * PageSkeleton): manifest start_url — саме /hub, тож це ЄДИНА сторінка,
 * яку реально видно на холодному запуску встановленого PWA, і форма
 * скелетона має збігатись із реальною (вертикальна колонка карток, не
 * сітка) — інакше видимий стрибок при заміні (скарга користувача,
 * 2026-09-19).
 *
 * Вкладка "Головна" одразу активна (заливка --cb-primary просто на
 * .tab-btn-indicator, а не через окремий .tab-pill, що зазвичай їде
 * JS-виміром getBoundingClientRect у HubShell.jsx) — статичний скелетон
 * рухатись нікуди не буде, а домовленість "перше відкриття встановленого
 * PWA завжди на /hub" відома заздалегідь (той самий start_url), тож
 * зображати нейтральний/невідомий стан немає сенсу: користувач бачив, як
 * таббар "вмикає колір" одразу після заміни скелетона на справжній shell
 * (скарга 2026-09-19) — тепер обидва стани виглядають однаково.
 */
export function HubShellSkeleton() {
  return (
    <div className="stage stage--hub">
      <div className="course-col">
        <div className="course-card">
          <div className="appbar">
            <PlatformBrand size="sm" />
            {/* Дзвіночок/шестерня — статичні (без лічильника непрочитаних,
                без onClick): NotificationBell — клієнтський компонент із
                власним polling, тут потрібна лише його форма, щоб apbar не
                "стрибав" при заміні на справжній shell. */}
            <span className="iconbtn ntf-bell" aria-hidden="true">
              <BellIcon />
            </span>
            <span className="iconbtn" aria-hidden="true">
              <GearIcon />
            </span>
          </div>

          <div className="hub-viewport">
            <HubHomeSkeleton />
          </div>

          <nav className="tabbar" role="tablist" aria-hidden="true">
            {TABS.map(({ href, label, Icon }, i) => (
              <Link key={href} href={href} className={`tab-btn${i === 0 ? " active" : ""}`} role="tab" aria-label={label} tabIndex={-1}>
                <span className="tab-btn-indicator" style={i === 0 ? { background: "var(--cb-primary)" } : undefined}>
                  <Icon filled={i === 0} />
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
