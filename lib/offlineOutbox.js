/**
 * Черга запитів плеєра, що не долетіли без мережі (module-complete,
 * submit) — localStorage, у порядку появи. Досилається OfflineSync.jsx при
 * `online`/старті застосунку. Порядок важливий (модуль → курс), тому при
 * першій невдачі зупиняємось і лишаємо хвіст.
 * ponytail: localStorage, не Background Sync API — iOS його не має.
 */
const KEY = "carls-outbox";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* сховище недоступне — нічого не вдієш */
  }
}

export function enqueue(url, body) {
  write([...read(), { url, body, at: Date.now() }]);
}

export function outboxSize() {
  return read().length;
}

/** POST з черги по порядку; 4xx — викидаємо (повтор не допоможе), мережа/5xx — стоп. */
export async function flushOutbox() {
  const items = read();
  if (items.length === 0) return 0;
  let sent = 0;
  for (let i = 0; i < items.length; i += 1) {
    try {
      const res = await fetch(items[i].url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items[i].body),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      sent += 1;
    } catch {
      write(items.slice(i));
      return sent;
    }
  }
  write([]);
  return sent;
}
