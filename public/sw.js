// Service worker платформи. Три ролі:
//  1. критерій installability для Chrome (маніфест + HTTPS + SW = справжній
//     WebAPK при «Додати на головний екран», а не ярлик);
//  2. Web Push: приймає повідомлення від push-сервісу й показує системне
//     сповіщення; клік відкриває/фокусує застосунок на потрібному екрані;
//  3. офлайн: network-first кеш усіх same-origin GET (сторінки, RSC,
//     чанки, next/image) — онлайн поведінка не змінюється (завжди свіже,
//     HMR на dev не страждає), без мережі віддається останнє бачене.
//     Відкритий курс плеєр досилає повідомленням {type:"precache", urls}
//     (сторінка + фото всіх екранів), щоб ТП у полі без зв'язку міг
//     пройти курс до кінця; відповіді копить lib/offlineOutbox.js.
//
// Payload — JSON із lib/webPush.js: { title, body, url, tag, category }.
// iOS (16.4+, лише встановлена PWA) вимагає, щоб КОЖЕН push показував
// сповіщення — «тихих» там не буває; тому showNotification завжди.

const ICON = "/icons/icon-192.png";
const DEFAULT_URL = "/hub/notifications";

self.addEventListener("install", () => self.skipWaiting());
const CACHE = "carls-offline-v1";
const IMAGE_WIDTH = 828; // ширина next/image для precache; офлайн підходить будь-яка закешована

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(networkFirst(req, url));
});

async function networkFirst(req, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    // next/image: те саме фото, але інша ширина/якість — офлайн годиться
    // будь-який закешований варіант того ж url=.
    if (url.pathname === "/_next/image") {
      const want = url.searchParams.get("url");
      for (const key of await cache.keys()) {
        const k = new URL(key.url);
        if (k.pathname === "/_next/image" && k.searchParams.get("url") === want) return cache.match(key, { ignoreVary: true });
      }
    }
    if (req.mode === "navigate") {
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Немає мережі</title><body style="font-family:system-ui;padding:32px;text-align:center"><h2>Немає з’єднання</h2><p>Ця сторінка ще не відкривалась на цьому пристрої. Відкриті раніше курси доступні офлайн.</p><p><a href="/hub">На головну</a></p></body>',
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
    throw err;
  }
}

// Плеєр просить закешувати курс наперед: сторінку і фото всіх екранів.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        event.data.urls.map((u) => {
          const target = /^https?:/.test(u) ? `/_next/image?url=${encodeURIComponent(u)}&w=${IMAGE_WIDTH}&q=75` : u;
          return cache.match(target, { ignoreVary: true }).then((hit) => hit || cache.add(target).catch(() => {}));
        })
      )
    )
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // Відкриті вкладки/PWA дізнаються про подію одразу (дзвіночок оновлює
  // лічильник без очікування наступного опитування).
  const ping = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => clients.forEach((c) => c.postMessage({ type: "push", title: data.title })));
  event.waitUntil(
    self.registration.showNotification(data.title || "CarLS", {
      body: data.body || "",
      icon: ICON,
      badge: ICON,
      // Однакові за типом замінюють одне одного в шторці, а не копичаться.
      tag: data.tag || "carls",
      renotify: true,
      data: { url: data.url || DEFAULT_URL },
    }).then(() => ping)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || DEFAULT_URL, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Уже відкрита PWA/вкладка — фокусуємо й переводимо, а не друге вікно.
      const client = clients.find((c) => "focus" in c);
      if (client) {
        if ("navigate" in client) client.navigate(target);
        return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

// Push-сервіс змінив endpoint (ротація) — перепідписуємось тим самим
// ключем і повідомляємо сервер, інакше людина мовчки перестане отримувати.
self.addEventListener("pushsubscriptionchange", (event) => {
  const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
  if (!applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then((sub) =>
        fetch("/api/push/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), replacesEndpoint: event.oldSubscription?.endpoint }),
        })
      )
      .catch(() => {})
  );
});
