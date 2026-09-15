/**
 * Клієнтська частина Web Push (браузер): стан підтримки/дозволу, підписка,
 * відписка. Без React — щоб викликатись і з компонентів, і з тестів
 * (чисті функції внизу).
 *
 * Особливості платформ (актуально на 2026):
 *  - Android/Chrome, Windows/Chrome/Edge, macOS/Safari — працює у вкладці
 *    і в PWA.
 *  - iOS/iPadOS 16.4+ — ЛИШЕ в PWA, доданій на екран «Додому»
 *    (display-mode: standalone); у Safari-вкладці Push API взагалі
 *    відсутній. Тому стан "ios-not-installed" — окремий: людині треба
 *    спершу встановити, а не «дозволити».
 *  - Дозвіл можна просити тільки з жесту користувача (клік) — авто-запит
 *    при завантаженні браузери блокують і назавжди «затемнюють» promt.
 */

const SUBSCRIPTIONS_ENDPOINT = "/api/push/subscriptions";
const PUBLIC_KEY_ENDPOINT = "/api/push/public-key";

export function isIosDevice(ua = navigator.userAgent, platform = navigator.platform, maxTouchPoints = navigator.maxTouchPoints) {
  // iPadOS 13+ прикидається Mac — відрізняємо по touch.
  return /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function isStandaloneDisplay() {
  return (
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    window.navigator?.standalone === true
  );
}

/**
 * @returns {"unsupported"|"ios-not-installed"|"denied"|"subscribed"|"not-subscribed"}
 */
export async function getPushState() {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIosDevice() && !isStandaloneDisplay() ? "ios-not-installed" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "not-subscribed";
}

/** VAPID public key — base64url → Uint8Array для applicationServerKey. */
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Підписатись: питає дозвіл (має викликатись із кліку), реєструє
 * підписку в push-сервісі, віддає її на сервер.
 * @returns {Promise<"subscribed"|"denied"|"unavailable">}
 */
export async function subscribeToPush() {
  const keyRes = await fetch(PUBLIC_KEY_ENDPOINT);
  if (!keyRes.ok) return "unavailable";
  const { publicKey } = await keyRes.json();
  if (!publicKey) return "unavailable";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const res = await fetch(SUBSCRIPTIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error("Не вдалося зберегти підписку");
  return "subscribed";
}

/** Відписатись на цьому пристрої: і в браузері, і на сервері. */
export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch(SUBSCRIPTIONS_ENDPOINT, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}
