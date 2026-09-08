"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SettingsSheet } from "@/components/SettingsSheet";
import { GearIcon, HomeIcon, LearnIcon, AchievementsIcon, ProfileIcon } from "@/components/icons";

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
export function HubShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
            <div
              className="hub-brand"
              style={{
                flex: 1,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "calc(14px * var(--fs-scale))",
              }}
            >
              Платформа адаптації
            </div>
            <button className="iconbtn" aria-label="Налаштування" onClick={() => setSettingsOpen(true)}>
              <GearIcon />
            </button>
          </div>

          <div className="hub-viewport">{children}</div>

          <nav className="tabbar" role="tablist">
            {TABS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className={`tab-btn${pathname === href ? " active" : ""}`}
                role="tab"
              >
                <Icon />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onLogout={handleLogout} />
    </div>
  );
}
