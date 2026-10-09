# carlsberg-LMS

Мобільна навчальна платформа Carlsberg Ukraine — курси з тестами для
співробітників, кабінет керівника з аналітикою по команді та внутрішня
адмінка для конструювання курсів і керування співробітниками. Мігровано з
vanilla JS + Google Sheets (архів — [`/legacy`](./legacy)) на **Next.js
(App Router) + Prisma + Postgres**.

**Деплой на прод** — чек-лист у [`DEPLOY.md`](./DEPLOY.md): змінні Vercel,
міграції через `vercel-build`, перевірка `/api/health`.

## Що є в застосунку

**Кабінет співробітника** (`/hub`, `/courses/[slug]`) — мобільний
курс-плеєр (Модуль → Екран → Компонент): інфо-екрани, тести з декількох
типів питань, чек-листи, таймлайни, фотозвіти. Прохідний бал і пауза між
модулями налаштовуються окремо на кожен курс; курс зараховано лише коли
складено кожен модуль. Сертифікат — за 100% проходження. Реальний
адаптивний вигляд: той самий контент автоматично перебудовується під
широкий десктопний екран (CSS container query), не лишається "мобільною
карткою" на великому моніторі.

**Кабінет керівника** (`/manager`) — дашборд із картками, які можна
переставляти й ховати: стан команди, «потребують уваги» з нагадуванням,
матриця люди × курси, дедлайни, розподіл балів, найскладніші модулі й
питання, тижнева активність, порівняння команд. Кожна цифра веде на
список людей із фільтром (`/manager/team`) і далі на картку людини;
Excel-звіт по всій видимій команді.

**Адмінка** (`/admin`) — окремий вхід за паролем:
- конструктор курсів (модулі/екрани/компоненти, drag-and-drop, живе
  прев'ю з вибором платформи — телефон чи ноутбук);
- призначення курсів за посадою/територією/департаментом/точково;
- повний CRUD співробітників, дерево підпорядкування, скидання PIN;
- ачивки (ручні й автоматичні за реальним прогресом);
- Excel-експорт бази й окрема "жива" Excel-книга через Power Query
  (Bearer-токен, без admin-сесії).

## Стек

- **Next.js 16** (App Router, Turbopack) + React 19
- **Prisma 7** (`@prisma/adapter-pg`, конфіг у `prisma7.config.mjs`) + Postgres (Neon)
- Vercel Blob (фото), Resend (прод-пошта) / Gmail SMTP (dev), PDFKit (сертифікати), ExcelJS/SheetJS (звіти/імпорт)
- Vitest (тести), ESLint + Husky/lint-staged (pre-commit)

## Структура проєкту

| Тека | Що там |
| --- | --- |
| `app/` | маршрути App Router: `hub/` (співробітник), `courses/[slug]` (плеєр), `manager/`, `admin/`, `register/`, `tg/` (Telegram Mini App); `app/api/**/route.*` — API (опис у `openapi.yaml`, перегляд на `/admin/api`) |
| `app/styles/` | CSS за розділами; токени дизайн-системи — `tokens.css` |
| `components/ui/` | загальні атоми: `HintDot`, `Skeleton`, `StatusBadge`, `BottomSheet`, `Avatar`, `CountUp`, `CompletionRing`, іконки |
| `components/app/` | глобальне з кореневого layout: офлайн-синк, service worker, заборона копіювання, розміри таблиць |
| `components/shell/` | каркаси кабінетів (`HubShell`, `ManagerShell`, `AdminShell`), їхні скелети, налаштування; спільне — `shellCommon.tsx`, вкладки — `shellNav.ts` |
| `components/hub/` | профіль, рейтинг, досягнення, сертифікати, картка курсу |
| `components/course/` | плеєр курсу, план курсу, екрани й питання |
| `components/course-editor/` | конструктор курсу (дерево, поля типів компонентів, прев'ю) і спільні поля налаштувань курсу |
| `components/manager/` | дашборд керівника, список і картка людини, нагадування, звіт |
| `components/admin/` | адмінка: каталог курсів, співробітники, оргструктура, відзнаки, журнал, дизайн-стенд |
| `components/notifications/` | дзвоник, центр сповіщень, налаштування сповіщень |
| `hooks/` | клієнтські хуки: `useDismiss` (Esc + блок скролу), `useDragReorder`/`useIdOrder` (перетягування), `useFlip`, `useSeenValue`, `usePullToRefresh` |
| `lib/` | доменна логіка й серверні модулі: правила курсу (`coursePlan`, `progress`, `grading`), сесії й доступ, Prisma, сповіщення, звіти; чисті модулі — з `*.test.ts` поруч |
| `prisma/` | схема, міграції, сид-скрипти |
| `e2e/` | Playwright-тести крихких сценаріїв (вхід — `e2e/fixtures.ts`) |

Нові файли — TypeScript. Перед тим як писати хелпер, хук чи компонент,
перевірте, чи такий уже є: перелік спільних частин і правила структури —
`.claude/agents/code-structure-guardian.md`.

## Розробка

```bash
npm install
npm run dev
```

Відкрийте [http://localhost:3000](http://localhost:3000).

Потрібні змінні середовища (`.env`, не комітиться):

| Змінна | Призначення |
| --- | --- |
| `DATABASE_URL` | підключення до Postgres (Neon) |
| `SESSION_SECRET` | підпис сесійних cookie співробітника |
| `ADMIN_PASSWORD` | єдиний пароль входу в `/admin` |
| `CRON_SECRET` | авторизація щоденного cron (прострочення, авто-ачивки, авто-призначення) |
| `RESEND_API_KEY` | продова пошта (PIN-коди) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (фото в курсах) |
| `EMAIL_PROVIDER`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` | опційно, лише для dev — надсилання PIN через Gmail SMTP замість Resend |
| `SYNTHETIC_DEMO_DATABASE_URL` | окрема БД для `prisma/seed-synthetic-demo*.js` (навмисно відділена від `DATABASE_URL`, щоб демо-скрипти не могли зачепити реальні дані) |

Міграції та наповнення бази:

```bash
npx prisma migrate deploy   # застосувати міграції
npx prisma generate         # згенерувати клієнт (також автоматично при npm install)
node prisma/seed.js         # системний адмін-акаунт (для assignedById/awardedById) + перший курс
```

`prisma/import-employees.js` / `import-territories.js` — одноразовий
імпорт реальної оргструктури з Excel. `prisma/seed-synthetic-demo.js` —
повністю вигадана демо-організація (жодних реальних людей) для
розробки/демонстрацій.

## Перевірка перед комітом

```bash
npx tsc --noEmit -p .
npm run lint
npm run test
npm run test:e2e    # Playwright; потрібен запущений dev-сервер на :3000
npm run build
```

## Стара версія (vanilla JS)

Повністю робоча версія на vanilla JS + Google Sheets лежить у
[`/legacy`](./legacy) — використовується лише як довідка при перенесенні
логіки, окремо не деплоїться.
