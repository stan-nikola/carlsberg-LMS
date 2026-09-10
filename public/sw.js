// Мінімальний service worker — навмисно НЕ кешує нічого (жодного
// fetch-обробника). Єдина мета — дати Chrome сигнал "це повноцінний
// installable PWA" (манфест + HTTPS + service worker = критерії
// installability), щоб "Додати на головний екран" видавало справжній
// довірений WebAPK замість спрощеного ярлика, який Google Play Захист
// іноді помічає як "небезпечний додаток" (застарілий шлях встановлення,
// не сам код). Повноцінний офлайн-кеш усього застосунку (як у
// legacy/sw.js) — окрема задача для продакшену: на dev-сервері з
// Turbopack HMR такий кеш заважав би бачити свіжі правки одразу.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
