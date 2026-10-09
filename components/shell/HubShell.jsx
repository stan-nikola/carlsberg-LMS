"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SettingsSheet } from "@/components/shell/SettingsSheet";
import { GearIcon, LockIcon, SpinnerIcon } from "@/components/ui/icons";
import { PlatformBrand } from "@/components/shell/PlatformBrand";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { HUB_NAV as TABS } from "@/components/shell/shellNav";
import { NavPending, logout, useShellEffects, useTabPill } from "@/components/shell/shellCommon";

/**
 * Каркас хаба: appbar + settings sheet + tabbar з реальними роутами
 * (замість перемикання .hub-screen.active, як у legacy index.html).
 * Дані сотрудника отримує layout (Server Component) і сюди не потрібні —
 * логаут працює через сесію-cookie на сервері.
 */
export function HubShell({ children, isAdmin = false }) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Прокрутка шестерні на клік (2026-09-22, рішення користувача) — той
  // самий "спалахнути й повернутись" прийом, що й .ntf-bell.is-ringing.
  const [gearSpinning, setGearSpinning] = useState(false);
  const gearSpinTimeoutRef = useRef(null);
  function spinGear() {
    setSettingsOpen(true);
    setGearSpinning(true);
    clearTimeout(gearSpinTimeoutRef.current);
    gearSpinTimeoutRef.current = setTimeout(() => setGearSpinning(false), 500);
  }
  const viewportRef = useRef(null);
  const { pull, threshold } = usePullToRefresh(viewportRef);
  useShellEffects("hub");
  // Поза вкладками (/hub/notifications з дзвоника) капсула ховається.
  const { tabbarRef, pillRef, tabRef } = useTabPill(TABS.find((t) => pathname === t.href)?.href);


  // Перехід між вкладками — це client-side навігація всередині ОДНОГО й
  // того самого внутрішнього скрол-контейнера (.hub-viewport), а не окрема
  // сторінка з власним скролом: Next.js скидає лише window-скрол, про цей
  // контейнер він не знає. Без цього, якщо попередній екран був
  // прогорнутий вниз (напр. довгий блок "від колег"), новий відкривався
  // вже "з середини" — верх нового екрана виглядав обрізаним.
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => () => clearTimeout(gearSpinTimeoutRef.current), []);

  return (
    <div className="stage stage--hub">
      <div className="course-col">
        <div className="course-card">
          <div className="appbar">
            <PlatformBrand size="sm" href="/hub" />
            {isAdmin && (
              <Link className="iconbtn" aria-label="Адміністратор" href="/admin">
                <LockIcon />
              </Link>
            )}
            <NotificationBell href="/hub/notifications" />
            <button
              className={`iconbtn${gearSpinning ? " is-spinning" : ""}`}
              aria-label="Налаштування"
              onClick={spinGear}
            >
              <GearIcon />
            </button>
          </div>

          <div className="hub-viewport" ref={viewportRef}>
            <div className="ptr-indicator" style={{ height: pull, opacity: Math.min(1, pull / threshold) }} aria-hidden="true">
              <SpinnerIcon />
            </div>
            {children}
          </div>

          <nav className="tabbar" role="tablist" ref={tabbarRef}>
            <span className="tab-pill" ref={pillRef} aria-hidden="true" />
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
                  <span className="tab-btn-indicator" ref={tabRef(href)}>
                    <Icon filled={isActive} />
                  </span>
                  <NavPending />
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onLogout={logout} />
    </div>
  );
}
