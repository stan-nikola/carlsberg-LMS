"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SettingsSheet } from "@/components/SettingsSheet";
import { GearIcon, LockIcon, HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";

const TABS = [
  { href: "/hub", label: "Головна", Icon: HomeIcon },
  { href: "/hub/learn", label: "Навчання", Icon: LearnIcon },
  { href: "/hub/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/hub/profile", label: "Профіль", Icon: ProfileIcon },
];

/**
 * Каркас хаба: appbar + settings sheet + tabbar з реальними роутами
 * (замість перемикання .hub-screen.active, як у legacy index.html).
 * Дані сотрудника отримує layout (Server Component) і сюди не потрібні —
 * логаут працює через сесію-cookie на сервері.
 */
export function HubShell({ children, isAdmin = false }) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const viewportRef = useRef(null);

  // Перехід між вкладками — це client-side навігація всередині ОДНОГО й
  // того самого внутрішнього скрол-контейнера (.hub-viewport), а не окрема
  // сторінка з власним скролом: Next.js скидає лише window-скрол, про цей
  // контейнер він не знає. Без цього, якщо попередній екран був
  // прогорнутий вниз (напр. довгий блок "від колег"), новий відкривався
  // вже "з середини" — верх нового екрана виглядав обрізаним.
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/register");
    router.refresh();
  }

  return (
    <div className="stage">
      <div className="course-col">
        <div className="course-card">
          <div className="appbar">
            <PlatformBrand size="sm" />
            {isAdmin && (
              <Link className="iconbtn" aria-label="Адмін-панель" href="/admin">
                <LockIcon />
              </Link>
            )}
            <button className="iconbtn" aria-label="Налаштування" onClick={() => setSettingsOpen(true)}>
              <GearIcon />
            </button>
          </div>

          <div className="hub-viewport" ref={viewportRef}>{children}</div>

          <nav className="tabbar" role="tablist">
            {TABS.map(({ href, label, Icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`tab-btn${isActive ? " active" : ""}`}
                  role="tab"
                  aria-label={label}
                  aria-selected={isActive}
                  title={label}
                >
                  <span className="tab-btn-indicator">
                    <Icon filled={isActive} />
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onLogout={handleLogout} />
    </div>
  );
}
