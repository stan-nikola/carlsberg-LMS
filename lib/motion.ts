/** Користувач просить менше руху (налаштування ОС) — JS-анімації це перевіряють самі, CSS глушить через @media. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}
