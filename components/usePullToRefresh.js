"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 64; // px потрібно потягнути, щоб відпускання оновило дані
const MAX_PULL = 96; // візуальна стеля — далі індикатор перестає їхати
const RUBBER_BAND = 0.5; // палець їде швидше за індикатор — "гумовий" опір

/**
 * "Потягнути, щоб оновити" — для екранів /hub і /manager (запит
 * користувача, 2026-09-19, "как в Инстаграм"), а не router.refresh() на
 * КОЖЕН перехід між вкладками (той самий запит: миттєве перемикання
 * замість повторного скелетона щоразу, тепер що вкладки самі дадуть
 * Cache Components).
 *
 * Слухає touch напряму на DOM-елементі (не React-синтетичні хендлери) —
 * потрібен {passive:true}, інакше пасивний скрол-лоу Chrome/Safari
 * попереджає в консоль і сам скрол смикається. Активується лише коли
 * контейнер уже прокручений до самого верху (scrollTop===0) в момент
 * дотику — інакше звичайний скрол вниз/вгору сприймався б як спроба
 * оновлення.
 *
 * router.refresh() не повертає Promise (node_modules/next/dist/docs/…
 * use-router.md) — обгортка в startTransition() дає реальний isPending,
 * а не вгаданий setTimeout.
 *
 * scrollRef — для /hub (одна внутрішня .hub-viewport на всю "телефонну"
 * картку). Без ref (undefined/null.current) — window-режим для /manager
 * (app/styles/manager.css: "сторінки /manager скролляться самим вікном,
 * а не внутрішньою карткою, як /hub", навмисне архітектурне рішення) —
 * слухає touch на document, читає window.scrollY. На десктопі (миша, не
 * тач) touch-події просто ніколи не приходять — природний no-op, окремо
 * вимикати під ширину не треба.
 */
export function usePullToRefresh(scrollRef) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pull, setPull] = useState(0);

  useEffect(() => {
    const el = scrollRef?.current ?? null;
    const target = el ?? document;
    const getScrollTop = () => (el ? el.scrollTop : window.scrollY);

    let startY = null;
    let pulling = false;
    // Звичайна змінна, не useState: onTouchEnd читає "актуальне" значення
    // синхронно, без setState-updater'а — React забороняє startTransition()
    // усередині функції-апдейтера ("Cannot call startTransition while
    // rendering", 2026-09-19), бо той виконується у фазі рендеру.
    let currentPull = 0;

    function onTouchStart(e) {
      if (getScrollTop() > 0 || isPending) return;
      startY = e.touches[0].clientY;
      pulling = true;
    }

    function onTouchMove(e) {
      if (!pulling || startY == null) return;
      const dy = e.touches[0].clientY - startY;
      currentPull = dy <= 0 ? 0 : Math.min(MAX_PULL, dy * RUBBER_BAND);
      setPull(currentPull);
    }

    function onTouchEnd() {
      if (!pulling) return;
      pulling = false;
      startY = null;
      setPull(0);
      if (currentPull >= THRESHOLD) {
        // Android — реальна вібрація; iOS Safari/WebKit Vibration API
        // взагалі не реалізує (свідоме обмеження Apple, не наш баг) —
        // просто нічого не станеться, візуальний спіннер лишається.
        if (navigator.vibrate) navigator.vibrate(10);
        startTransition(() => router.refresh());
      }
      currentPull = 0;
    }

    target.addEventListener("touchstart", onTouchStart, { passive: true });
    target.addEventListener("touchmove", onTouchMove, { passive: true });
    target.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      target.removeEventListener("touchstart", onTouchStart);
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", onTouchEnd);
    };
  }, [scrollRef, isPending, router]);

  return { pull: isPending ? THRESHOLD : pull, isPending, threshold: THRESHOLD };
}
