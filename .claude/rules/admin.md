---
paths:
  - "app/admin/**"
  - "app/api/admin/**"
  - "app/api/data/**"
  - "components/Admin*"
  - "components/Employee*"
  - "components/ExcelLivePanel*"
  - "lib/admin*"
  - "lib/audit*"
  - "lib/badgeRules*"
  - "lib/achievements*"
---

## /admin

- Повністю ОКРЕМИЙ вхід від employee PIN-логіну — один спільний
  `ADMIN_PASSWORD`, сесія `admin_session` (`lib/adminSession.js`), жодного
  зв'язку з конкретним Employee. Другий пароль `SUPER_ADMIN_PASSWORD` на
  тому ж екрані дає рівень "super" (у підписаному payload cookie) — поки
  лише для дизайн-системи `/admin/design`; перевірка `isSuperAdmin()`.
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
  (`lib/achievements.ts`).
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

- Журнал дій (`AuditLog`, `lib/audit.ts audit(action, targetType, targetId,
  details)`) — write-роути `/admin` пишуть рядок best-effort (помилка
  журналу не ламає дію). Свідомо НЕ журналюються поекранні PATCH
  конструктора (screens/components, автозбереження і drag-and-drop —
  десятки запитів на хвилину) і upload фото; журналюються створення/
  видалення курсів, модулів, папок, типів відзнак і ручна розсилка; дивитись у `/admin/audit` (`components/AdminAudit.tsx`).
  **Повний журнал платформи (2026-10-04):** `AuditLog.actor` — "super" | "admin"
  (рівень admin_session; імені людини нема — спільний пароль), "manager" |
  "employee" (+ `actorEmployeeId`), "system" (cron). Дії співробітників —
  `auditEmployee()` (пише через `after()`, без затримки відповіді): входи
  (`auth.*`, `admin.login*`), навчання (`learning.*`), керівники (`manager.*`),
  профіль/сповіщення (`profile.*`), `activity.visit` (раз на годину — той самий
  сигнал, що `lastSeenAt`). Записи співробітників і системи прибирає щоденний
  cron через `AppSetting(audit-retention-days)` (дефолт 180, змінює лише
  супер-адмін на /admin/audit); дії адмінів — назавжди. Новий write-роут або
  нова дія користувача = виклик `audit()`/`auditEmployee()` і підпис в
  `ACTION_LABELS` (+ розбір у `describe()`) у `components/AdminAudit.tsx`.
