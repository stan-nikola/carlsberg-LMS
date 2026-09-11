@AGENTS.md

# Правила та конвенції проєкту

Цей проєкт мігрує legacy vanilla JS + Google Sheets систему на Next.js +
Prisma + Postgres (Neon). Нижче — рішення й правила, до яких дійшли за
попередню розробку, щоб не переоткривати їх у кожній новій сесії.

## Жорсткі правила (не порушувати без явного дозволу користувача)

- **Ніякого TypeScript.** Проєкт свідомо на чистому JS. Навіть якщо
  генератор/шаблон пропонує `.ts`/`.tsx` — писати `.js`/`.jsx`.
- **Ніколи не вигадувати дані.** Якщо зв'язок/значення не можна вивести зі
  100% впевненістю з наявних даних — лишати `null`/невизначеним і питати
  користувача, а не писати правдоподібне-але-неперевірене. Це стосується
  особливо організаційної структури (managerId), територій, будь-яких
  зв'язків між реальними людьми. Один раз невірна евристика вже призначила
  реальній людині невірного керівника (детектовано користувачем, що
  особисто знає оргструктуру) — виправлено системно, не тільки для одного
  запису.
- **Ніколи не писати реальні секрети в `.env` самостійно** (DB-паролі,
  API-ключі, токени) — навіть якщо користувач надіслав значення прямо в
  чат і попросив вписати. Користувач вписує сам; можна підказати, куди і
  що саме вписати.
- **Не гадати структуру нового Next.js.** `AGENTS.md` (авто-генерується
  `next dev`, не редагувати вручну) — версія тут із breaking changes
  відносно тренувальних даних; звірятись з
  `node_modules/next/dist/docs/`.

## Стек і конфігурація

- **Prisma 7**, закріплено на стабільній `7.10.0` (не `latest` — той тег
  на npm якийсь час указував на нестабільний `8.0.0-rc.*`). Генератор —
  `prisma-client-js` (не новий `prisma-client`, той емітить `.ts`).
  Конфіг підключення — `prisma7.config.mjs`, **не** `url = env(...)` у
  `schema.prisma`.
- Драйвер — `@prisma/adapter-pg` (`PrismaPg`), не стандартний Prisma
  connection pooling.
- Postgres — Neon, одна гілка на все (dev = "прод", окремої dev-гілки
  поки нема — див. TODO нижче).
- Скрипти поза Next.js (`prisma/*.js`) — plain CommonJS
  (`require("dotenv/config")`, `PrismaClient` з `../app/generated/prisma`,
  `PrismaPg` з `DATABASE_URL`). Не спільний ESM-модуль з рештою проєкту —
  свідомо, заради простоти.
- Windows: `node`/`npx`/`npm` не завжди на `PATH` у новому шеллі — префікс
  `$env:Path = "C:\Program Files\nodejs;" + $env:Path` у PowerShell.
  Dev-сервер часто падає з `EPERM ... .next\dev\...` через залипший
  процес `node` — використовуй скіл `/restart-dev`, не просто
  `npm run dev`.

## Дані та ієрархія

- **Employee.name** пишеться в базу ЛИШЕ з email-адреси
  (`nameFromEmail`), ніколи з введеного вручну імені. Співробітники без
  email (польові ролі) — введене ними ім'я лишається тільки в
  `localStorage` пристрою (`lib/localName.js`), на сервер не йде.
- **Employee.email** є лише в менеджерського шару (SV/ASM/LKAM/RM
  HoReCa/FSM MT/SV RKA), крім ТП RKA (свідомо прибрано, хоч і потрапляв
  під евристику). Польові ролі отримують PIN на пошту `manager.email`.
- **Employee.externalCode** — шукати через `findFirst({ where: {
  externalCode: { equals, mode: "insensitive" } } })`, не `findUnique` —
  код у джерелі в основному UPPERCASE, юзер може ввести як завгодно.
- **Ієрархія (managerId)**: пряме підпорядкування — ASM → SV → ТП → МР.
  RM HoReCa/LKAM/FSM MT/ASM/SV(без ASM)/SV RKA — верхівки своїх гілок,
  managerId навмисно `null` (немає надійного способу резолвити). RM
  HoReCa ↔ SV/ТП HoReCa — dotted-line зв'язок, свідомо не змодельований.
- **Territory** ієрархічна (`parentId`, як і `Employee.managerId`):
  RM-регіон → ASM-область → SV-район/місто. Назва вузла = "посада +
  територія" одним рядком ("ASM Сумська область") — ім'я людини в
  дужках з джерела НІКОЛИ не пишеться в базу, лише як ключ зіставлення
  під час імпорту.
- Зіставлення кирилиця→база при імпорті — фамілія обов'язково, ім'я лише
  як тай-брейк при кількох однофамільцях; ніколи не по самому імені.
  Транслітерація в реальних даних нестабільна (одна й та сама буква різні
  люди пишуть по-різному) — покладатись на це не можна.

## Курси (Course → Module → Screen → Component)

- Ієрархія контенту: **Course → Module → Screen → Component**, не
  пласка Course → Module. (До 2026-09 рівні називались
  Course → Block → Module → Lesson — перейменовано: старий Block став
  Module, старий Module став Screen, старий Lesson став Component; див.
  `///`-коментар при `model Module` у `schema.prisma`.) Module —
  угруповання для навігації, Enrollment рахується по Course в цілому, не
  по модулю.
- **"Пауза між модулями"** (`Module.cooldownDays`) — наступний модуль
  відкривається лише після того, як склали (80%+) усі тести
  ПОПЕРЕДНЬОГО (`ModuleCompletion.passed=true`), і минула пауза, що
  рахується від РЕАЛЬНОЇ дати складання (`ModuleCompletion.completedAt`),
  а не від дати призначення курсу. Окремого календарного механізму
  (колишній `unlockAfterDays`, рахував від дати ПРИЗНАЧЕННЯ курсу) в
  схемі більше нема — прибрали (2026-09), лишився лише
  completion-based `cooldownDays`.
- **`Course.targetPositions`/`targetTerritories`/`publishAt`** — це лише
  ЗБЕРЕЖЕНИЙ НАМІР. Сам по собі не створює жодного `Enrollment`. Реальне
  призначення — кнопка «Призначити зараз» в /admin (одразу) або
  `publishAt` + щоденний cron (`lib/courseAssignment.js
  publishScheduledCourses`).
- Фото уроків — Vercel Blob, **сховище має бути Public access** (приватне
  не працює з `next/image`/прямими посиланнями).

## /admin

- Повністю ОКРЕМИЙ вхід від employee PIN-логіну — один спільний
  `ADMIN_PASSWORD`, сесія `admin_session` (`lib/adminSession.js`), жодного
  зв'язку з конкретним Employee.
- Через це дії з /admin (напр. `Enrollment.assignedById`,
  `EmployeeBadge.awardedById` при ручній видачі) пишуться від фіктивного
  системного Employee (`externalCode: "SYSTEM-ADMIN"`, заводиться в
  `prisma/seed.js`).
- Повний CRUD співробітників (картка `/admin/employees/[id]`,
  `components/EmployeeDetail.jsx` + `AdminEmployees.jsx`) — редагування
  полів, зміна ролі, скидання PIN, drag-and-drop редактор дерева
  підпорядкування (`components/EmployeeTree.jsx`,
  `lib/managerDashboard.js getTeamTree(null)` для всієї організації).
  Видалення співробітника — лише soft-delete через `Employee.isActive`
  (деактивований не може залогінитись, `lib/auth.js`, але вся історія —
  підлеглі, enrollments, бейджі — лишається).
- Ачивки/бейджі (`Badge`/`EmployeeBadge`, `lib/badgeRules.js`) —
  `kind: manual` видає адмін вручну з картки співробітника
  (`components/EmployeeBadgesSection.jsx`/`AdminBadges.jsx`),
  `kind: auto` нараховується щоденним cron
  (`app/api/cron/check-overdue-enrollments/route.js` →
  `evaluateAutoBadgesForAll`). Той самий список показується
  співробітнику в `components/AchievementsPanel.jsx`
  (`lib/achievements.js`).
- Ручна корекція проходження курсу (`Enrollment.adminNote`,
  `components/EmployeeCoursesSection.jsx`,
  `app/api/admin/enrollments/[enrollmentId]/route.js`) — статус/бал/дати
  можна скорегувати вручну (напр. "пройшов офлайн"), `adminNote`
  обов'язковий як аудит-слід.
- Excel: разовий повний дамп бази (`app/api/admin/export/route.js`) +
  xlsx-імпорт/шаблон співробітників (`app/api/admin/employees/import*`)
  через admin_session, ЯК І ВСІ решта `/admin`-роутів. Окремо —
  "жива" Excel-книга через Power Query (`app/api/data/{employees,
  courses,enrollments}/route.js`) — це навмисно ІНШИЙ механізм
  авторизації: Bearer-токен (`AdminApiToken`, `lib/adminApiToken.js`),
  прив'язаний до конкретного Employee з роллю admin/hr_manager, видається
  й відкликається в `/admin` (`components/ExcelLivePanel.jsx`,
  `app/api/admin/tokens/*`), НЕ `admin_session` cookie (Power Query не
  вміє нести cookie з браузерної сесії).

## Логін співробітника

- PIN генерується заново при КОЖНОМУ запиті (не статичний), живе 12
  годин (`PIN_TTL_MS` у `lib/auth.js`).
- Продакшн завжди шле через Resend, незалежно від `EMAIL_PROVIDER` — та
  змінна читається лише поза продом (dev може перемкнутись на Gmail SMTP,
  `lib/mailer.js`).

## Робочий процес

- Міграції на таблицях із реальними даними — скіл `/db-migrate`
  (create-only → ручна правка SQL при потребі → `migrate deploy`,
  ніколи `migrate reset`/`db push --accept-data-loss` без явного дозволу
  користувача).
- Одноразові скрипти для перевірки/діагностики — `scratch-*.js` у корені
  проєкту, видаляти одразу після використання (не комітити).
- Комітити/пушити — лише коли користувач явно попросив.

### Само-оптимізація: помічаєш повторення — пропонуй скіл

Якщо в межах ОДНІЄЇ сесії доводиться вручну повторити ту саму
багатокрокову послідовність команд 3+ рази (не одну команду — саме
послідовність: наприклад "убити node → почистити .next → підняти dev"
або "create-only → правка SQL → migrate deploy → generate → перевірка")
— зупинись і запропонуй користувачу оформити це як `.claude/skills/`
проєкту, за прикладом `restart-dev`/`db-migrate` (вони самі з'явились
саме так — 15+ ручних перезапусків dev-сервера за одну сесію). Не чекай,
поки попросять: коротко опиши, яку послідовність пропонуєш зафіксувати,
і чому саме зараз (яка повторюваність це показала) — рішення лишається
за користувачем, ти лише помічаєш патерн і пропонуєш.

Це стосується не тільки shell-команд: та сама логіка — якщо тричі
пишеш майже однаковий `scratch-*.js` для однієї й тієї ж перевірки
(порахувати щось, звірити стан після дії) — це теж кандидат або на
скіл, або на постійний (не scratch) скрипт у `prisma/` чи `lib/`.

## Відомі незакриті пункти

- Немає окремої Neon dev-гілки — вся розробка йде проти тієї ж бази, де
  реальні дані. Варто завести `dev`-гілку від `production` і переключити
  локальний `DATABASE_URL`.
- Домен у Resend не підтверджено — продові листи реально йдуть лише на
  пошту власника акаунта Resend.
- ~~Немає UI для скидання PIN адміном, немає UI для призначення ролей
  admin/hr_manager~~ — закрито (`/admin/employees/[id]`, див. розділ
  `/admin` вище): є і скидання PIN (`reset-pin` route), і зміна ролі.
- `EnrollmentAttempt.longestCorrectStreak` завжди 0 (streak-механіка
  відкладена разом з акордеонами legacy — той акордеон уже частково
  повернули для "Варто знати", решта legacy-механік (gate, конфеті) ще
  ні).
