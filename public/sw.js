// Service worker платформи. Три ролі:
//  1. критерій installability для Chrome (маніфест + HTTPS + SW = справжній
//     WebAPK при «Додати на головний екран», а не ярлик);
//  2. Web Push: приймає повідомлення від push-сервісу й показує системне
//     сповіщення; клік відкриває/фокусує застосунок на потрібному екрані;
//  3. офлайн: ДВІ стратегії кешу для same-origin GET, залежно від типу
//     (аудит швидкодії, 2026-09-19):
//     - сторінки/RSC-пейлоади ПОВНОГО завантаження (адресний рядок, F5) —
//       і далі network-first, онлайн поведінка не міняється (завжди свіже,
//       HMR на dev не страждає);
//     - /_next/static/* (JS/CSS/шрифти — хешовані у назві файла, тому
//       ІМУТАБЕЛЬНІ: зміна вмісту завжди дає нову назву) і /_next/image
//       (фото курсів) — stale-while-revalidate: віддаємо закешоване
//       МИТТЄВО, без очікування мережі, і оновлюємо кеш у фоні. Для
//       іменованого хешем файла "застаріла" відповідь неможлива за
//       визначенням; для фото — той самий принцип, що вже був у офлайн-
//       фолбеку нижче ("будь-який закешований варіант того ж url= годиться").
//     Без мережі — останнє бачене (обидві стратегії).
//     Відкритий курс плеєр досилає повідомленням {type:"precache", urls}
//     (сторінка + фото всіх екранів), щоб ТП у полі без зв'язку міг
//     пройти курс до кінця; відповіді копить lib/offlineOutbox.js.
//
//     RSC-фетчі КЛІЄНТСЬКОЇ навігації (Link-клік між екранами, query-рядок
//     несе "_rsc=<hash>") тут НЕ перехоплюються взагалі — SW навмисно
//     пропускає їх мимо (return, без respondWith). Знайдено живою
//     перевіркою на проді (2026-09-20): navigator.serviceWorker перехоплює
//     ЦІ фетчі так само, як звичайну сторінку, і networkFirst() ЗАВЖДИ йде
//     в мережу першою — навіть коли клієнтський Router Cache Next.js уже
//     мав готову відповідь ("use cache"/"use cache: private" із
//     lib/employeeProgress.js, lib/managerOverview.js). На localhost цього
//     не видно (мережа — loopback, мілісекунди), а на реальному Vercel
//     кожен перехід між екранами SW змушував ЗНОВУ чекати на реальний
//     round-trip — той самий "скелетони між екранами" баг, який
//     виглядав як проблема кешування даних, а насправді SW перехоплював
//     і зводив кеш нанівець. Повне завантаження сторінки (адресний рядок,
//     F5) — це запит БЕЗ "_rsc" у query, він і далі йде через
//     networkFirst() нижче: офлайн-фолбек і "завжди свіже на F5" не
//     постраждали.
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

// /_next/static/... — хешовані у назві файли (JS/CSS/шрифти), завжди з
// вкладеним шляхом. /_next/image — рівно цей шлях (без "/" після, сам
// url фото йде в query-рядку: /_next/image?url=...&w=...&q=...) — окрема
// перевірка, не той самий regex.
const STATIC_ASSET = /^\/_next\/static\//;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // RSC-навігація (клієнтський Link-клік) — не перехоплюємо: нехай браузер
  // сам вирішує з власного Router Cache, без вимушеного мережевого
  // round-trip щоразу. Див. великий коментар на початку файла.
  if (url.searchParams.has("_rsc")) return;
  const isStatic = STATIC_ASSET.test(url.pathname) || url.pathname === "/_next/image";
  event.respondWith(isStatic ? staleWhileRevalidate(event, req, url) : networkFirst(req, url));
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

async function staleWhileRevalidate(event, req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  // Оновлення в фоні — навіть коли є кеш-хіт, наступний візит матиме
  // свіжіший варіант; помилку мережі тут навмисно ковтаємо (як
  // networkFirst() ловить err у своєму catch), бо відповідь уже пішла
  // з кешу й чекати нема на що. event.waitUntil() — інакше браузер може
  // "приспати" SW одразу після return hit нижче, і фоновий fetch/cache.put
  // ніколи не довиконається (respondWith() сам по собі життя SW не продовжує).
  const revalidate = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  event.waitUntil(revalidate);
  if (hit) return hit;
  const res = await revalidate;
  if (res) return res;
  // next/image: точної відповідності нема (інша ширина/якість того ж
  // фото) — той самий принцип, що офлайн-фолбек у networkFirst().
  if (url.pathname === "/_next/image") {
    const want = url.searchParams.get("url");
    for (const key of await cache.keys()) {
      const k = new URL(key.url);
      if (k.pathname === "/_next/image" && k.searchParams.get("url") === want) return cache.match(key, { ignoreVary: true });
    }
  }
  throw new Error(`staleWhileRevalidate: no cache and network failed for ${url.pathname}`);
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
