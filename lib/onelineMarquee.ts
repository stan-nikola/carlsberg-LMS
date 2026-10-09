/**
 * Однорядкові підписи карток дашборда керівника (2026-10-04, рішення
 * користувача): заголовок і підписи рядків діаграм ніколи не переносяться —
 * у спокої обрізані «…», а повністю видно біжучим рядком ЛИШЕ на вимогу:
 * поки над підписом миша (десктоп) або один прохід після тапу (телефон).
 * Не MarqueeText, що біжить завжди: у сітці він стартував на всіх картках
 * одночасно й у застиглій фазі читався обрізаним з початку (CLAUDE.md,
 * «Верстка: сітки однотипних карток»).
 *
 * Той самий список селекторів — у app/styles/manager.css (блок
 * «Однорядкові підписи»): CSS дає nowrap/ellipsis і анімацію, тут — коли її
 * вмикати.
 */
import { MARQUEE_SPEED_PX_PER_SEC } from "@/components/ui/MarqueeText";

export const ONELINE_SELECTOR =
  ".mgr-chart-card .mgr-card-title, .mgr-chart-card .mgr-card-note, .mgr-chart-card .mgr-bar-label:not(.mgr-bar-label-stack), .mgr-chart-card .mgr-bar-label-main, .mgr-chart-card .mgr-bar-label-sub";

// Рух — середні 70% циклу (@keyframes mgr-oneline-scroll), як і в
// MarqueeText: та сама швидкість у px/с, що й решта біжучих рядків.
const MOVE_FRACTION = 0.7;
// Коротке обрізання (20px) за чистою швидкістю — цикл менше секунди, і паузи
// на початку/в кінці не встигаєш помітити; нижня межа тримає їх читабельними.
const MIN_CYCLE_S = 3;

/** Підпис під курсором/пальцем, якщо він реально обрізаний. */
export function truncatedOnelineAt(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>(ONELINE_SELECTOR) : null;
  return el && el.scrollWidth - el.clientWidth > 1 ? el : null;
}

/** Запустити біжучий рядок; `once` — один прохід (тап), інакше — поки не зупинять. */
export function startOneline(el: HTMLElement, once: boolean) {
  const shift = el.scrollWidth - el.clientWidth;
  el.style.setProperty("--oneline-shift", `${shift}px`);
  el.style.setProperty("--oneline-dur", `${Math.max(MIN_CYCLE_S, shift / MARQUEE_SPEED_PX_PER_SEC / MOVE_FRACTION)}s`);
  el.classList.toggle("is-once", once);
  el.classList.add("is-scrolling");
  if (once) el.addEventListener("animationend", () => stopOneline(el), { once: true });
}

export function stopOneline(el: HTMLElement) {
  el.classList.remove("is-scrolling", "is-once");
}
