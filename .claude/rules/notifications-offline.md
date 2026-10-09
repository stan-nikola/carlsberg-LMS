---
paths:
  - "lib/notification*"
  - "lib/webPush*"
  - "lib/pushClient*"
  - "lib/telegram*"
  - "lib/offlineOutbox*"
  - "public/sw.js"
  - "components/notifications/**"
  - "components/app/OfflineSync*"
  - "components/admin/AdminTelegram*"
  - "components/admin/AdminBroadcast*"
  - "app/api/notifications/**"
  - "app/api/push/**"
  - "app/api/telegram/**"
  - "app/api/cron/**"
  - "app/tg/**"
  - "app/api/tg/**"
---

## Сповіщення (центр + Web Push)

- **Одна точка входу** — `lib/notifications.js notifyEmployees(ids, event)`:
  фільтр за вподобаннями (`NotificationPreference`, дефолт — усе
  увімкнено) → рядки `Notification` (центр сповіщень; `dedupeKey @unique`
  + `createManyAndReturn(skipDuplicates)` роблять будь-який cron
  ідемпотентним) → Web Push на всі `PushSubscription` адресата
  (`lib/webPush.js`, бібліотека `web-push`, VAPID). Push — лише доставка;
  джерело правди — рядок у БД, тож людина без дозволу на push (або на iOS
  без встановленої PWA) усе одно бачить подію в центрі.
- **Події** (тип → категорія у `lib/notificationTypes.ts`): призначення
  курсу (`lib/courseAssignment.js enrollEmployees`), нагадування за 3/1
  день і прострочення (cron), ачивки авто/ручні, денний дайджест
  керівнику по прямих підлеглих (cron), ручна розсилка з
  `/admin/notifications` (`Broadcast`). Усе — best-effort у `try/catch`:
  збій доставки ніколи не відкочує бізнес-дію.
- **Секрети:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  (`mailto:…`) — генерує й вписує в .env/Vercel користувач:
  `npx web-push generate-vapid-keys`. Без них `isPushConfigured()` → false,
  push мовчки вимкнено, центр працює.
- **Telegram** (`lib/telegram.ts`, `lib/telegramLogic.ts`, 2026-09-16) — другий
  канал доставки в тому ж `notifyEmployees`: після push шле в чат бота
  CarlsON усім з `TelegramLink`, у кого `NotificationPreference.telegram`
  не false. Прив’язка — deep link з профілю (`t.me/<bot>?start=<token>`,
  токен HMAC на SESSION_SECRET, 15 хв, без таблиці) → webhook
  `app/api/telegram/webhook` (перевіряє `TELEGRAM_WEBHOOK_SECRET`) робить
  upsert; `/stop` — відв’язати; інший текст — у `TelegramInbound` для
  адмінки. Bot API — прямі fetch, без бібліотеки. Зниклі чати (403/«chat not
  found») видаляються, як push 404/410. Адмінка: `/admin/notifications` →
  `AdminTelegram` (стан, webhook, прив’язки, тест, вхідні); розсилка
  обирає канали (`Broadcast.channels/pushed/telegramSent`). Без
  `TELEGRAM_BOT_TOKEN` канал мовчки вимкнено.
- **Клієнт:** `public/sw.js` (push/notificationclick/pushsubscriptionchange,
  без кешу), `lib/pushClient.js` (стан: unsupported / ios-not-installed /
  denied / subscribed / not-subscribed; дозвіл питати ЛИШЕ з кліку),
  `NotificationBell` (polling 60с), `NotificationCenter` (перегляд =
  прочитано), `NotificationSettings` (картка на /hub + перемикачі в
  профілі). iOS 16.4+: push лише зі встановленої PWA — компонент це
  пояснює, а не просить дозвіл даремно.


## Офлайн (PWA)

- `public/sw.js` — network-first кеш усіх same-origin GET (крім `/api/`):
  онлайн завжди свіже (HMR не страждає), без мережі — останнє бачене; для
  `/_next/image` офлайн підходить будь-яка закешована ширина того ж `url=`.
  Плеєр при відкритті шле SW `{type:"precache", urls}` (сторінка + усі фото
  екранів), щоб курс можна було пройти в полі без зв’язку.
- Відповіді без мережі — `lib/offlineOutbox.ts` (localStorage-черга
  module-complete/submit по порядку), досилає `components/app/OfflineSync.jsx`
  на старті і на `online`. Background Sync API свідомо не використано —
  iOS його не має. Результат у черзі = сертифікат недоступний до синку.
