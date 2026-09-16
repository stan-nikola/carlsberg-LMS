# Деплой на прод (Vercel + Neon)

Прод деплоїться з гілки `main` автоматично при push (Vercel Git
integration). Цей файл — чек-лист того, що НЕ робиться само.

## 0. Перший деплой з нуля (покроково, проекту у Vercel ще нема)

Потрібно: акаунт GitHub (репозиторій уже там), 15 хвилин, термінал у папці
проекту (де `package.json`).

### Крок 1. Підготувати секрети (до Vercel, у терміналі)

Кожну команду виконати один раз, результат скопіювати в блокнот — далі
вставите у Vercel. У чат/Slack не кидати.

1. **SESSION_SECRET** — випадковий рядок:
   ```bash
   node -e "console.log(require(crypto).randomBytes(32).toString(hex))"
   ```
2. **CRON_SECRET** — та сама команда ще раз (інший рядок).
3. **ADMIN_PASSWORD** — придумайте пароль адмінки (не той, що десь ще).
4. **VAPID-ключі для push** (нова пара саме для прода):
   ```bash
   npx web-push generate-vapid-keys
   ```
   Виведе `Public Key` і `Private Key` — обидва скопіювати.
   `VAPID_SUBJECT` = `mailto:ваша@пошта`.
5. **DATABASE_URL** — рядок підключення до бази. Це та база, де вже все
   налаштовано для демо: відкрити локальний `.env`, взяти значення
   `SYNTHETIC_DEMO_DATABASE_URL` (починається з `postgresql://`).
6. **RESEND_API_KEY** — resend.com → API Keys → Create API Key → скопіювати
   (показується один раз). `RESEND_FROM_EMAIL` задавати лише якщо домен у
   Resend підтверджено (Domains → Verified); інакше пропустити — листи
   підуть з тестової адреси на пошту власника акаунта Resend.
7. **DEMO_LOGIN_CODES** (на час демо):
   `MR0106,MR0107,MR0108,TECH0071,TECH0072,SR0106,SR0107,SR0108,SV0036`.

### Крок 2. Створити проект у Vercel

1. vercel.com → **Sign Up** → **Continue with GitHub** (дозволити доступ).
2. Після входу: **Add New… → Project**.
3. У списку **Import Git Repository** знайти `carlsberg-LMS` → **Import**.
   Якщо репозиторію нема: **Adjust GitHub App Permissions** → дати доступ
   до цього репозиторію → повернутись.
4. На екрані налаштування:
   - **Framework Preset**: Next.js (визначається сам).
   - **Root Directory**: `./` (не міняти).
   - **Build and Output Settings**: нічого не міняти — Vercel візьме
     `vercel-build` з `package.json` (він сам застосує міграції).
   - **Environment Variables**: розгорнути і додати змінні з Кроку 1 —
     по одній: Name = назва, Value = значення, **Add**. Список:
     `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `CRON_SECRET`,
     `RESEND_API_KEY`, (`RESEND_FROM_EMAIL`), `VAPID_PUBLIC_KEY`,
     `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `DEMO_LOGIN_CODES`.
5. **Deploy**. Збірка триває 2–4 хвилини. Зелений екран з конфеті і
   адресою виду `https://carlsberg-lms.vercel.app` — прод живий.

Якщо збірка впала: **Deployments → останній → Build Logs**. Найчастіше —
помилка в `DATABASE_URL` (рядок скопійовано не повністю) або відсутня
змінна. Виправити в **Settings → Environment Variables** і **Redeploy**.
`P1002 … advisory lock` на кроці `prisma migrate deploy` — база була
зайнята іншою міграцією (паралельна збірка); просто **Redeploy**.

### Крок 3. Сховище фото (Blob)

1. У проекті: **Storage → Create Database → Blob → Create**.
2. Назва будь-яка, **Access: Public** (обов’язково — інакше фото уроків
   не відкриються). **Connect to project** → Vercel сам додасть
   `BLOB_READ_WRITE_TOKEN` у змінні.
3. **Deployments → ⋯ → Redeploy**, щоб змінна потрапила в білд.

### Крок 4. Перевірити

1. Відкрити `https://<адреса>/register` — екран входу, зверху зліва є
   «Тестовий вхід» (означає, що `DEMO_LOGIN_CODES` підхопився).
2. `https://<адреса>/admin` → пароль з `ADMIN_PASSWORD` → відкривається
   адмінка, у «Курси» видно 9 курсів (база та сама, що в демо).
3. `https://<адреса>/api/health` → `"ok": true`, `"push": true`.
4. **Settings → Cron Jobs** — має бути `/api/cron/check-overdue-enrollments`
   щодня 03:00 (береться з `vercel.json`).
5. З телефона: відкрити адресу, «На Початковий екран» (iPhone: Safari →
   Поділитись), запустити з іконки, у профілі увімкнути push — має прийти
   тестове сповіщення з `/admin/notifications`.

### Крок 5. Далі кожен деплой

Push у `main` (merge PR) = автоматичний деплой. Preview-адреса для
кожного PR — у коментарі бота Vercel під PR.

## 1. Перед merge у `main`

- CI зелений (`npm run build` = `next build`, lint, тести).
- Міграції в PR лише аддитивні (нові таблиці/колонки з default або
  nullable) — див. скіл `/db-migrate`. Деструктивні (drop/rename) —
  окремим PR і з бекапом Neon (Branches → create branch від production).

## 2. Змінні оточення у Vercel (Project → Settings → Environment Variables)

Повний список — `.env.example`. Обов'язкові для прода:

| Змінна | Навіщо | Де взяти |
| --- | --- | --- |
| `DATABASE_URL` | бойова база Neon | Neon → Connection string (pooled). **З 2026-09-15 бойова база — колишня демо-база** (та, що локально в `SYNTHETIC_DEMO_DATABASE_URL`): курси, результати, рейтинг і відзнаки для демонстрації живуть у ній. Стара прод-база з реальним імпортом співробітників лишилась окремим проектом Neon, не видаляти. |
| `SESSION_SECRET` | підпис cookie сесії | `openssl rand -hex 32`, інший ніж на dev |
| `ADMIN_PASSWORD` | вхід у `/admin` | придумати |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | PIN-листи через Resend | resend.com; **без підтвердженого домену Resend шле лише на пошту власника акаунта** |
| `EMAIL_PROVIDER=gmail`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` | PIN-листи через Gmail SMTP — поки нема свого домену (рішення 2026-09-15) | Google-акаунт → Безпека → Паролі застосунків (16 символів); ліміт ~500 листів/добу. Коли домен підтверджено — прибрати `EMAIL_PROVIDER`, повернеться Resend |
| `BLOB_READ_WRITE_TOKEN` | фото уроків | Vercel → Storage → Blob (public access) |
| `CRON_SECRET` | захист `/api/cron/*` | будь-який довгий рядок |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push | `npx web-push generate-vapid-keys`; **окрема пара для прода**, не та, що в dev/чаті; `VAPID_SUBJECT=mailto:…` |
| `DEMO_LOGIN_CODES` | «Тестовий вхід» на `/register` | кома-список кодів демо-персон; **лише на час демо**, потім прибрати |

`DEV_TEST_EMAIL_OVERRIDE`, `SYNTHETIC_DEMO_DATABASE_URL`
— лише для локальної розробки, на прод не додавати.

Після зміни змінних — Redeploy (Vercel не перечитує їх у вже зібраному
деплої).

## 3. Що робить сам білд

`vercel-build`: на **Production** — `prisma migrate deploy`, потім
`next build`; на Preview — лише `next build`. Усі нові міграції з
`prisma/migrations` застосовуються до бази перед збіркою. Упала міграція
= упав деплой, прод лишається на попередній версії.

Міграції йдуть **прямим** з'єднанням (без `-pooler` у хості —
`prisma7.config.mjs` сам прибирає його з `DATABASE_URL`, або задай
`DIRECT_DATABASE_URL`): через pooler `migrate deploy` падав з
`P1002 … advisory lock`. Preview-збірки міграцій не запускають — раніше
preview гілки і production-збірка `main` після мержу стартували
одночасно, обидві брали advisory lock на одній базі, і production
падала з тим самим P1002.

## 4. Після деплою

1. `GET https://<домен>/api/health` → `{ ok: true, db: true, lastMigration: "…", push: true }`.
   `push: false` — не задано VAPID; `demoLogin: true` — увімкнено тестовий вхід.
2. Перший раз після появи рейтингу: `/admin/rating` → «Перерахувати все»
   (заповнює журнал балів за вже пройденими курсами).
3. Cron (`vercel.json`, щодня 03:00 UTC): публікація курсів за
   `publishAt`, нагадування про дедлайни, авто-відзнаки, дайджест
   керівникам. Перевірити в Vercel → Cron Jobs, що він увімкнений.
4. PWA: після зміни `manifest`/назви/статус-бару на iPhone застосунок
   треба перевстановити («На Початковий екран» заново).
5. Push працює лише по https — з прод-домену; з localhost/LAN — ні.

## 5. Відкат

Vercel → Deployments → попередній → Promote to Production. Міграції
назад не відкочуються (вони аддитивні, старий код нові колонки просто
не читає).
