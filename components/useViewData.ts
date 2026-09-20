"use client";

import { useEffect, useState } from "react";
import { getCachedView, setCachedView } from "@/lib/clientViewCache";

type ViewState<T> = { data: T | undefined; loading: boolean; error: boolean };

/**
 * Дані однієї вкладки ManagerShell.jsx — з клієнтського кешу миттєво,
 * якщо він уже теплий (перемикання вкладки, що вже відкривали цього
 * сеансу), інакше один fetch і кеш на майбутнє.
 *
 * key — той самий рядок, яким ManagerShell позначає вкладку (href). Кожен
 * View-компонент (TeamView, CoursesView…) викликає це з ОДНИМ фіксованим
 * key на весь час свого життя (перемикання вкладки монтує НОВИЙ
 * компонент, не переперевикористовує цей), тож лінивий initial state
 * (нижче) читає кеш рівно один раз при монтуванні — синхронний setState
 * усередині ефекту не потрібен узагалі (react-hooks/set-state-in-effect).
 *
 * fetcher — async-функція, що повертає дані (новий fetch-виклик буде лише
 * коли кешу немає).
 */
export function useViewData<T>(key: string, fetcher: () => Promise<T>): ViewState<T> {
  const [state, setState] = useState<ViewState<T>>(() => {
    const cached = getCachedView<T>(key);
    return cached !== undefined ? { data: cached, loading: false, error: false } : { data: undefined, loading: true, error: false };
  });

  useEffect(() => {
    if (getCachedView<T>(key) !== undefined) return undefined;
    let cancelled = false;
    fetcher()
      .then((result) => {
        if (cancelled) return;
        setCachedView(key, result);
        setState({ data: result, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ data: undefined, loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
