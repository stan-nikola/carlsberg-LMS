/**
 * Черга запитів плеєра, що не долетіли без мережі (module-complete,
 * submit) — localStorage, у порядку появи. Досилається OfflineSync.jsx при
 * `online`/старті застосунку. Порядок важливий (модуль → курс), тому при
 * першій невдачі зупиняємось і лишаємо хвіст.
 * ponytail: localStorage, не Background Sync API — iOS його не має.
 *
 * Переписано 2026-09-27 (аудит логіки, L-6):
 *  - з черги прибирається рівно відправлений елемент (за id), а не
 *    «весь знімок, прочитаний на початку»: запис, доданий під час
 *    повільного flush, раніше перезаписувався й губився;
 *  - 401 (сесія скінчилась) і 429 лишають елемент — після входу він
 *    дійде; раніше будь-який 4xx викидав результат назавжди;
 *  - дві вкладки не шлють ту саму чергу одночасно (Web Locks);
 *    повтор того ж запиту сервер і так ігнорує за clientAttemptId у тілі.
 */
const KEY = "carls-outbox";

export type OutboxItem = { id: string; url: string; body: unknown; at: number };

function read(): OutboxItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(items) ? items.map((it, i) => ({ ...it, id: it.id ?? `legacy-${it.at}-${i}` })) : [];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* сховище недоступне — нічого не вдієш */
  }
}

export function newAttemptId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function enqueue(url: string, body: unknown): string {
  const id = newAttemptId();
  write([...read(), { id, url, body, at: Date.now() }]);
  return id;
}

export function outboxSize(): number {
  return read().length;
}

export function clearOutbox(): void {
  write([]);
}

function remove(id: string): void {
  write(read().filter((it) => it.id !== id));
}

/** Статуси, з якими елемент лишається в черзі: повтор пізніше має сенс. */
const RETRY_LATER = (status: number) => status >= 500 || status === 401 || status === 429;

async function flushUnlocked(): Promise<number> {
  let sent = 0;
  for (;;) {
    const head = read()[0];
    if (!head) return sent;
    let res: Response;
    try {
      res = await fetch(head.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(head.body),
      });
    } catch {
      return sent;
    }
    if (RETRY_LATER(res.status)) return sent;
    // 2xx — дійшло; решта 4xx (курс/модуль уже недоступний) — повтор не допоможе.
    remove(head.id);
    if (res.ok) sent += 1;
  }
}

/** POST з черги по порядку. Повертає, скільки елементів сервер прийняв. */
export async function flushOutbox(): Promise<number> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request) return locks.request("carls-outbox", () => flushUnlocked());
  return flushUnlocked();
}
