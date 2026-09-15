// Service worker платформи. Навмисно НЕ кешує нічого (жодного
// fetch-обробника): на dev-сервері з Turbopack HMR офлайн-кеш заважав би
// бачити свіжі правки. Дві ролі:
//  1. критерій installability для Chrome (маніфест + HTTPS + SW = справжній
//     WebAPK при «Додати на головний екран», а не ярлик);
//  2. Web Push: приймає повідомлення від push-сервісу й показує системне
//     сповіщення; клік відкриває/фокусує застосунок на потрібному екрані.
//
// Payload — JSON із lib/webPush.js: { title, body, url, tag, category }.
// iOS (16.4+, лише встановлена PWA) вимагає, щоб КОЖЕН push показував
// сповіщення — «тихих» там не буває; тому showNotification завжди.

const ICON = "/icons/icon-192.png";
const DEFAULT_URL = "/hub/notifications";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "CarLS", {
      body: data.body || "",
      icon: ICON,
      badge: ICON,
      // Однакові за типом замінюють одне одного в шторці, а не копичаться.
      tag: data.tag || "carls",
      renotify: true,
      data: { url: data.url || DEFAULT_URL },
    })
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
