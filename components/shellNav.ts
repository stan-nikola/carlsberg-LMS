import { HomeIcon, PeopleIcon, LearnIcon, AchievementsIcon, ProfileIcon } from "@/components/icons";

/** Вкладки хаба співробітника — одне джерело для HubShell і його скелета. */
export const HUB_NAV = [
  { href: "/hub", label: "Головна", Icon: HomeIcon },
  { href: "/hub/learn", label: "Навчання", Icon: LearnIcon },
  { href: "/hub/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/hub/profile", label: "Профіль", Icon: ProfileIcon },
];

/** Пункти меню кабінету керівника — одне джерело для ManagerShell і його скелета. */
export const MANAGER_NAV = [
  { href: "/manager", label: "Головна", Icon: HomeIcon },
  { href: "/manager/team", label: "Команда", Icon: PeopleIcon },
  { href: "/manager/courses", label: "Курси", Icon: LearnIcon },
  { href: "/manager/achievements", label: "Досягнення", Icon: AchievementsIcon },
  { href: "/manager/profile", label: "Профіль", Icon: ProfileIcon },
];

/** «Команда» лишається активною і на картці людини /manager/team/[id]. */
export function isManagerNavActive(pathname: string, href: string): boolean {
  if (href === "/manager/team") return pathname === href || pathname.startsWith("/manager/team/");
  return pathname === href;
}
