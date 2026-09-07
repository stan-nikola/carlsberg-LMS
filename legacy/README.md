# Legacy (vanilla JS + Google Sheets)

Оригінальна версія платформи до міграції на Next.js + Postgres. Залишено
для довідки під час перенесення логіки (Крок 3 міграції) — нічого звідси
не виконується новим застосунком.

Запуск для перегляду (окремо від нового Next.js застосунку в корені):

```
cd legacy
npm install
npx live-server
```

## Екрани

| Файл | Призначення |
|---|---|
| `index.html` | Реєстрація (Ім'я + код User_Id → PIN на пошту керівника) + Хаб (Головна/Навчання/Досягнення/Профіль) |
| `course-assortment.html` | Курс-тест «Асортимент» (26 екранів: інфокартки + квізи), доступний лише зареєстрованим (інакше редірект на `index.html`) |

## Структура

```
css/          base.css (токени, каркас, кнопки), registration.css, hub.css
js/           main.js (точка входу), registration.js (флоу код→PIN),
              cabinet.js (рендер кабінету), settings.js, helpers.js
apps-script/  registration.gs — Apps Script webhook (Google Таблиця = БД)
assets/       іконки, лого, фото курсів
manifest.json, sw.js — PWA-маніфест і офлайн-кеш
package.json  лише live-server як dev-залежність (немає збірки)
```

## Модель даних (Google Sheets замість БД)

Один Apps Script `doPost`-роутер (`apps-script/registration.gs`) на весь
застосунок, розрізняє запит за формою payload:

- **`{ action: "register" | "confirm", userId, name, pin? }`** → вкладка
  **Users** (`Email_SV | User_Id | User_key | User_Name | last_action`).
  `register` шукає рядок за `User_Id`, генерує статичний 4-значний PIN
  (записує в `User_key`, якщо ще порожній) і надсилає його листом на
  `Email_SV`. `confirm` звіряє введений PIN, записує `User_Name` і
  `last_action`.
- **`{ secret, sessionId, userId, svEmail, courseName, ... }`** (без
  `action`, secret має збігатися з `RESULTS_SECRET`) → вкладка **Results**
  (Timestamp, Session ID, SV, User_Id, Назва курсу, дати, тривалість,
  бали, %, залік, серія).

Авторизація нестандартна: не логін/пароль, а `User_Id` (код з зовнішнього
застосунку Monolit Agent) + PIN, який керівник передає користувачу вручну.

## localStorage-ключі (клієнтський стан)

- `telesale_profile_v1` — спільний профіль `{ name, userId, svEmail, registeredAt }`
- `telesale_fs_step` — розмір шрифту (0-3)
- `assort_progress_v1`, `assort_course_status`, `assort_pending_results` —
  прогрес/статус/черга результатів курсу «Асортимент» (префікс на курс —
  наступні курси матимуть свій префікс)
