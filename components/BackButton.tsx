"use client";

import { useRouter } from "next/navigation";
import { ArrowBackIcon } from "@/components/icons";

/**
 * Кругла «назад» у шапці drill-down сторінок кабінету керівника
 * (/manager/team, /manager/team/[id]). Повертає на ПОПЕРЕДНІЙ екран у тому
 * стані, в якому його лишили (рішення користувача 2026-09-24): з таблиці
 * — на дашборд із тією ж прокруткою, зі сторінки людини — на таблицю з
 * тими самими фільтрами. Тому це історія браузера, а не фіксоване
 * посилання «на рівень вище»: воно губило б фільтри в URL і прокрутку.
 *
 * Пряме посилання (нова вкладка, з пошти) — історії нема, ведемо на
 * `fallback`, інакше кнопка нічого б не робила.
 */
export function BackButton({ fallback = "/manager", label = "Назад" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  }
  return (
    <button type="button" className="iconbtn mgr-back-btn" onClick={goBack} title={label} aria-label={label}>
      <ArrowBackIcon />
    </button>
  );
}
