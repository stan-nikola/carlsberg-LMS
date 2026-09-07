# carlsberg-LMS

Платформа адаптації Carlsberg Ukraine — статичний PWA-сайт без збірки (Node потрібен лише для `live-server` під час розробки).

## Структура

```
index.html              розмітка (реєстрація + кабінет/хаб), підключає css/ і js/
manifest.json, sw.js     PWA-маніфест і service worker (офлайн-кеш)

css/
  base.css               токени, reset, каркас картки, кнопки, bottom sheet
  registration.css        екран реєстрації (ім'я + код → PIN)
  hub.css                 кабінет: профіль, XP, вкладки, досягнення

js/                       нативні ES-модулі (без бандлера, <script type="module">)
  main.js                 точка входу: завантажує профіль, показує потрібний екран
  registration.js         флоу реєстрації, виклики Apps Script webhook
  cabinet.js              renderCabinet(profile) — малює кабінет
  settings.js             розмір тексту + bottom sheet налаштувань
  helpers.js               дрібні утиліти (initials тощо)

apps-script/
  registration.gs         Google Apps Script Web App (User_Id → PIN на пошту SV).
                          Не виконується цим репо — вставляється в редактор
                          Apps Script і деплоїться окремо (інструкція у файлі).

assets/
  monolit-code-hint.png   скріншот для підказки "де знайти код"
```

## Розробка

```
npm install
npx live-server
```

## Бекенд

Реєстрація і результати курсів пишуться у Google Таблицю через окремо задеплоєні
Apps Script Web Apps (URL-и прописані в `js/registration.js`). Структура вкладки
`Users` та інструкція деплою — на початку `apps-script/registration.gs`.
