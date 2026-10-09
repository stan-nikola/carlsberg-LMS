"use client";

// Спільне для каркасів /hub і /manager: обидва рендерять свій нижній таббар
// з тією самою капсулою, той самий вихід і ті самі службові ефекти.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { consumeProgressDirty } from "@/lib/progressDirty";
import { finishLogout, prepareLogout } from "@/lib/logoutCleanup";
import { ChevronIcon } from "@/components/ui/icons";

/** Маркер «перехід триває» всередині Link (useLinkStatus працює лише в
 *  нащадку Link); стилізує саму вкладку через :has() у CSS. */
export function NavPending() {
  const { pending } = useLinkStatus();
  return <span className={`nav-pending${pending ? " is-pending" : ""}`} aria-hidden="true" />;
}

export async function logout(): Promise<void> {
  if (!(await prepareLogout())) return;
  await fetch("/api/auth/logout", { method: "POST" });
  finishLogout();
}

/** Службові ефекти каркаса: оновити екран після збереженого модуля і
 *  cookie-підказка для redirects() у next.config.mjs (/hub ↔ /manager). */
export function useShellEffects(shell: "hub" | "manager"): void {
  const pathname = usePathname();
  const router = useRouter();
  // Щойно збережено модуль/курс — цей екран у кеші браузера ще старий.
  useEffect(() => {
    if (consumeProgressDirty()) router.refresh();
  }, [pathname, router]);
  useEffect(() => {
    document.cookie = `carls_shell=${shell}; path=/; max-age=31536000; samesite=lax`;
  }, [shell]);
}

/**
 * Капсула під активною вкладкою таббару їде й змінює розмір до неї.
 * Поза вкладками (сповіщення з дзвоника) — ховається, а не вдає активну.
 * left:0 на .tab-pill у CSS обов'язковий: абсолютний елемент у flex-контейнері
 * інакше рахує «статичну позицію», і translate іде не від нуля.
 */
export function useTabPill(activeHref: string | undefined) {
  const pathname = usePathname();
  const tabbarRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef(new Map<string, HTMLElement>());

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const bar = tabbarRef.current;
    if (!pill || !bar) return;
    pill.style.opacity = activeHref ? "1" : "0";
    const activeEl = activeHref && tabRefs.current.get(activeHref);
    if (!activeEl) return;
    const move = () => {
      const barRect = bar.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      pill.style.width = elRect.width + "px";
      pill.style.height = elRect.height + "px";
      pill.style.transform = `translate(${elRect.left - barRect.left}px, ${elRect.top - barRect.top}px)`;
    };
    move();
    window.addEventListener("resize", move);
    return () => window.removeEventListener("resize", move);
  }, [activeHref, pathname]);

  const tabRef = (href: string) => (el: HTMLElement | null) => {
    if (el) tabRefs.current.set(href, el);
    else tabRefs.current.delete(href);
  };
  return { tabbarRef, pillRef, tabRef };
}

/**
 * Згорнутий (лише іконки) десктопний сайдбар /admin і /manager — особиста
 * зручність, тому localStorage, а не БД. Перший рендер — розгорнутий
 * (на сервері localStorage нема); збережене значення підхоплює layout-ефект
 * до першого малювання, тож при переходах «спалаху» немає.
 */
export function useSidebarCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState(false);
  useLayoutEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(storageKey) === "1") setCollapsed(true);
    } catch {
      // localStorage недоступний (приватний режим) — лишаємось розгорнутими.
    }
  }, [storageKey]);
  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // Не критично — просто не запам'ятається між сесіями.
      }
      return next;
    });
  }
  return { collapsed, toggle };
}

/** Кнопка згортання на правій межі сайдбара (по вертикальному центру, а не
 *  в рядку заголовка — там вона накладалась на напис). */
export function SidebarCollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Розгорнути панель" : "Згорнути панель";
  return (
    <button type="button" className="adm-sidebar-collapse-btn" title={label} aria-label={label} aria-expanded={!collapsed} onClick={onToggle}>
      <ChevronIcon />
    </button>
  );
}
