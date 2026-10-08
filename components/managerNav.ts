import { HomeIcon, PeopleIcon, LearnIcon, AchievementsIcon, ProfileIcon } from "@/components/icons";

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
