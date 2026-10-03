import { clearOutbox, flushOutbox, outboxSize } from "@/lib/offlineOutbox";

/**
 * Прибирання пристрою перед виходом з акаунта (2026-09-27, аудит S-M3):
 * польові команди ділять телефони, і все, що лишилось від попереднього
 * співробітника, — офлайн-кеш сторінок у service worker, збережений
 * прогрес курсів, черга результатів — інакше дісталось би наступному.
 *
 * Спершу пробуємо дослати чергу (поки ще жива сесія цієї людини). Якщо
 * щось лишилось (нема мережі) — питаємо: вихід зітре ці результати.
 * Повертає false, якщо людина передумала виходити.
 */
export async function prepareLogout(): Promise<boolean> {
  await flushOutbox().catch(() => 0);
  if (
    outboxSize() > 0 &&
    !window.confirm("На цьому пристрої є результати, які ще не надіслано (немає мережі). Якщо вийти зараз, їх буде втрачено. Вийти все одно?")
  ) {
    return false;
  }
  clearOutbox();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("course_progress_")) localStorage.removeItem(key);
    }
  } catch {
    /* сховище недоступне */
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "purge" });
  return true;
}
