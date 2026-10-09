// Прогрес проходження на пристрої (localStorage) і розбиття сесії на модулі.

import type { Answers, ModuleSegment, PlayerScreen, SavedProgress } from "@/components/course/player/types";

const STORAGE_PREFIX = "course_progress_";

// sessionKey — підпис набору екранів цієї сесії. idx — позиція у ПОТОЧНІЙ
// сесії; після складання модулів наступна сесія починається з інших
// модулів, і старий idx показував би в чуже питання (стенд механіки,
// 2026-09-22: діалог «продовжити?» після вже складеної сесії стрибав у
// середину наступного модуля). Чужий підпис = продовжувати нічого.
export function loadProgress(slug: string, sessionKey: string): SavedProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + slug);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved?.key === sessionKey) return saved;
      localStorage.removeItem(STORAGE_PREFIX + slug);
    }
  } catch {
    // localStorage недоступний — просто починаємо спочатку
  }
  return null;
}

export function saveProgress(slug: string, idx: number, answers: Answers, sessionKey: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + slug, JSON.stringify({ idx, answers, key: sessionKey }));
  } catch {
    // ігноруємо — прогрес просто не відновиться після перезавантаження
  }
}

/**
 * "Пауза між модулями" (Module.cooldownDays): межі модулів усередині
 * screens (0-based) — щоразу, як moduleId змінюється між сусідніми
 * екранами, починається новий сегмент.
 */
export function buildModuleSegments(screens: PlayerScreen[]): ModuleSegment[] {
  const segments: ModuleSegment[] = [];
  for (let i = 0; i < screens.length; i++) {
    const moduleId = screens[i].moduleId;
    const last = segments[segments.length - 1];
    if (last && last.moduleId === moduleId) {
      last.endIdx = i;
    } else {
      segments.push({ moduleId, moduleTitle: screens[i].moduleTitle, startIdx: i, endIdx: i });
    }
  }
  return segments;
}

// Час — лише в обробниках подій (Далі, завершення модуля), не в рендері.
export const nowMs = () => Date.now();

export const secondsSince = (startMs: number) => Math.max(0, Math.round((nowMs() - startMs) / 1000));

export function clearProgress(slug: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + slug);
  } catch {
    // ігноруємо
  }
}
