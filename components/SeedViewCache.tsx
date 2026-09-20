"use client";

import { useEffect } from "react";
import { setCachedView } from "@/lib/clientViewCache";

/**
 * Кладе серверні дані сторінки (SSR-заход/F5) у клієнтський кеш
 * ManagerShell.jsx — щоб перехід на ІНШУ вкладку й повернення назад цього
 * ж сеансу теж узяли дані з кешу, а не пішли в мережу знову. Рендериться
 * поруч зі звичайним вмістом сторінки, сам нічого не малює.
 */
export function SeedViewCache<T>({ viewKey, data }: { viewKey: string; data: T }) {
  useEffect(() => {
    setCachedView(viewKey, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
  return null;
}
