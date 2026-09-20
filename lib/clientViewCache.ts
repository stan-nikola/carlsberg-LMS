// Клієнтський кеш даних вкладок /manager (і, за потреби, /hub) — модульний
// синглтон у пам'яті браузера, живе, поки живий сам JS-модуль (переживає
// перемикання вкладок ManagerShell.jsx, скидається лише на справжнє
// перезавантаження сторінки).
//
// Навіщо не просто покластись на Next.js "use cache: private": на
// реальному Vercel (на відміну від локального `next start`) повторна
// клієнтська навігація на /manager однаково йшла на сервер щоразу —
// перевірено живим заміром (DOM-поллінг видимості скелетона на проді,
// 2026-09-20), а не лише резонним припущенням із документації. Це наш
// ВЛАСНИЙ кеш, який ManagerShell.jsx контролює напряму — перемикання
// вкладки, для якої кеш уже теплий, не чіпає мережу взагалі.
const cache = new Map<string, unknown>();

export function getCachedView<T>(key: string): T | undefined {
  return cache.has(key) ? (cache.get(key) as T) : undefined;
}

export function setCachedView<T>(key: string, data: T): void {
  cache.set(key, data);
}

export function clearCachedView(key: string): void {
  cache.delete(key);
}
