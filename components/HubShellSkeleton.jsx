import Link from "next/link";
import { GearIcon, BellIcon } from "@/components/icons";
import { HUB_NAV as TABS } from "@/components/shellNav";
import { PlatformBrand } from "@/components/PlatformBrand";
import { PageSkeleton } from "@/components/Skeleton";


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
 * капсули-індикатора. Контент — той самий PageSkeleton у .hub-screen, що
 * й у loading.tsx вкладок: один вигляд скелетона скрізь (2026-10-03).
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
            {/* Той самий скелетон, що в loading.tsx вкладок хаба й кабінету
                керівника (рішення користувача 2026-10-03: «везде один
                скелетон») — заголовок і картки з проміжками. */}
            <section className="hub-screen">
              <PageSkeleton />
            </section>
          </div>

          <nav className="tabbar" role="tablist" aria-hidden="true">
            {TABS.map(({ href, label, Icon }, i) => (
              <Link key={href} href={href} className={`tab-btn${i === 0 ? " active" : ""}`} role="tab" aria-label={label} tabIndex={-1}>
                <span className="tab-btn-indicator" style={i === 0 ? { background: "var(--accent-tabbar-bg)", color: "var(--accent-tabbar-fg)" } : undefined}>
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
