/**
 * Carlsberg LMS — єдиний webhook для платформи: реєстрація (User_Id + PIN на
 * пошту керівника) і приймання результатів курсів. Одна функція doPost, один
 * URL, один деплой — навмисно, щоб не тримати кілька Apps Script проєктів:
 * у ОДНОМУ проєкті не може бути двох функцій doPost (вони конфліктують,
 * перемагає та, що завантажилась останньою) — тож усе тут, в одному файлі.
 *
 * doPost сам визначає, який запит прийшов:
 *   - є action:"register" / action:"confirm"  → реєстрація (вкладка "Users")
 *   - є secret (без action)                    → результат курсу (вкладка "Results")
 *
 * ==================== РЕЄСТРАЦІЯ ====================
 * Вкладка "Users" (порядок колонок не важливий — за назвою заголовка):
 *   Email_SV | User_Id | User_key | User_Name | last_action
 *
 *   1) { action:"register", userId, name }
 *      → шукає рядок за User_Id. Якщо User_key ще порожній — генерує
 *        СТАТИЧНИЙ 4-значний PIN і записує в User_key назавжди (не
 *        одноразовий); якщо PIN вже є — просто пересилає той самий.
 *        Надсилає лист із PIN на Email_SV (відправник — "Carlsberg Academy",
 *        сама адреса листа лишається вашим Google-акаунтом — MailApp інакше
 *        не вміє без платного Workspace-домену).
 *   2) { action:"confirm", userId, name, pin }
 *      → звіряє pin з User_key. Якщо збігається — записує User_Name і
 *        last_action; User_key НЕ чіпає (PIN лишається дійсним і надалі).
 *        Повертає svEmail для показу в профілі.
 *
 * ==================== РЕЗУЛЬТАТИ КУРСІВ ====================
 * Вкладка "Results" (так само — за назвою заголовка):
 *   Timestamp | Session ID | SV | User_Id | Назва курсу | Початок курсу |
 *   Завершення курсу | Тривалість | Активний час | Балів набрано |
 *   Балів максимум | Результат % | Тест складено | Найдовша серія |
 *   Кубок Виконання (останню скрипт не заповнює — немає джерела даних)
 *
 *   { secret, sessionId, userId, svEmail, courseName, startedAt, completedAt,
 *     durationSeconds, activeTimeSeconds, scoreRaw, scoreMax, scorePercent,
 *     passed, longestCorrectStreak }
 *   secret має збігатися з RESULTS_SECRET, інакше — { ok:false, error:'unauthorized' }.
 *
 *   Заголовки колонок співставляються "нормалізовано" (лишаються лише
 *   літери/цифри/%, без пробілів, ком і регістру) — тож зайвий пробіл,
 *   кома чи навіть нерозривний пробіл у назві колонки в таблиці більше не
 *   зламають запис мовчки.
 *
 * ==================== ДЕПЛОЙ (зробити один раз) ====================
 *  1. Відкрийте Google Таблицю CarlsbergAcademyBase → Розширення → Apps Script.
 *  2. У цьому ОДНОМУ проєкті має бути РІВНО один файл з кодом (цей). Якщо
 *     є ще якісь .gs-файли (наприклад окремий results.gs) — видаліть їх,
 *     інакше буде конфлікт doPost, як описано вище.
 *  3. Розгорнути → Керування розгортаннями → редагувати існуюче
 *     розгортання → Версія: Нова версія → Розгорнути. URL лишається тим
 *     самим — на сайті нічого міняти не треба (він уже вписаний в
 *     js/registration.js як REG_WEBHOOK_URL і в course-assortment.html як
 *     RESULTS_WEBHOOK_URL — обидва мають вказувати на цей самий URL).
 *  4. Перший запуск, що чіпає MailApp, попросить підтвердити дозволи —
 *     підтвердіть.
 */

var SPREADSHEET_ID = '1KOD9Ut-5rK35GHwZ5hbsAM1UWq0KsM5xH2HGC4gNa1U';
var USERS_SHEET_NAME = 'Users';
var RESULTS_SHEET_NAME = 'Results';
var RESULTS_SECRET = 'stanislav.karmanov';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.action === 'register' || data.action === 'confirm') {
      return handleRegistration(data);
    }
    if (data.secret !== undefined) {
      return handleResult(data);
    }
    return jsonResponse({ ok: false, error: 'unknown_request' });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'server_error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ===================== РЕЄСТРАЦІЯ ===================== */
function handleRegistration(data) {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'sheet_not_found' });

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var colEmailSv = headers.indexOf('Email_SV');
  var colUserId = headers.indexOf('User_Id');
  var colUserKey = headers.indexOf('User_key');
  var colUserName = headers.indexOf('User_Name');
  var colLastAction = headers.indexOf('last_action');

  if (colUserId === -1 || colEmailSv === -1 || colUserKey === -1) {
    return jsonResponse({ ok: false, error: 'sheet_columns_missing' });
  }

  var userId = String(data.userId || '').trim();
  if (!userId) return jsonResponse({ ok: false, error: 'not_found' });

  var rowIndex = -1; // 0-based index into `values`; actual sheet row = rowIndex + 1
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][colUserId]).trim().toLowerCase() === userId.toLowerCase()) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex === -1) return jsonResponse({ ok: false, error: 'not_found' });

  var svEmail = String(values[rowIndex][colEmailSv] || '').trim();

  if (data.action === 'register') {
    if (!svEmail) return jsonResponse({ ok: false, error: 'no_sv_email' });

    // Статичний PIN: якщо для цього User_Id його ще не було — генеруємо
    // один раз і записуємо назавжди. Якщо вже є — пересилаємо той самий
    // (щоб СВ не доводилось щоразу дізнаватись новий код).
    var pin = String(values[rowIndex][colUserKey] || '').trim();
    if (!pin) {
      pin = String(Math.floor(1000 + Math.random() * 9000)); // 4 цифри
      sheet.getRange(rowIndex + 1, colUserKey + 1).setValue(pin);
    }

    var name = String(data.name || '').trim();
    MailApp.sendEmail({
      to: svEmail,
      name: 'Carlsberg Academy',
      subject: 'Підтвердження реєстрації — ' + userId,
      body:
        'Користувач "' + (name || userId) + '" (код ' + userId + ') запитує вхід у ' +
        'платформу адаптації Carlsberg.\n\n' +
        'PIN-код для підтвердження: ' + pin + '\n\n' +
        'Передайте цей код користувачу, щоб він завершив реєстрацію. ' +
        'Цей PIN постійний і діятиме для всіх майбутніх входів цього користувача.'
    });

    return jsonResponse({ ok: true });
  }

  if (data.action === 'confirm') {
    var storedPin = String(values[rowIndex][colUserKey] || '').trim();
    var enteredPin = String(data.pin || '').trim();
    if (!storedPin || storedPin !== enteredPin) {
      return jsonResponse({ ok: false, error: 'invalid_pin' });
    }

    if (colUserName !== -1) sheet.getRange(rowIndex + 1, colUserName + 1).setValue(String(data.name || '').trim());
    if (colLastAction !== -1) sheet.getRange(rowIndex + 1, colLastAction + 1).setValue(new Date());
    // User_key навмисно НЕ очищаємо — PIN статичний і лишається дійсним.

    return jsonResponse({ ok: true, svEmail: svEmail });
  }

  return jsonResponse({ ok: false, error: 'unknown_action' });
}

/* ===================== РЕЗУЛЬТАТИ КУРСІВ ===================== */
function handleResult(data) {
  if (String(data.secret || '') !== RESULTS_SECRET) {
    return jsonResponse({ ok: false, error: 'unauthorized' });
  }

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RESULTS_SHEET_NAME);
  if (!sheet) return jsonResponse({ ok: false, error: 'sheet_not_found' });

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  // Заголовок у таблиці може містити зайві/нерозривні пробіли, кому чи
  // інший регістр, через що ТОЧНЕ співставлення рядків мовчки не спрацьовує
  // (комірка просто лишається порожньою, без жодної помилки). Тому
  // порівнюємо за "нормалізованим" ключем: лишаємо лише літери, цифри й
  // "%", решту (будь-які пробіли, коми, розділові знаки) відкидаємо.
  function normKey(s) {
    return String(s)
      .toLowerCase()
      .split('')
      .filter(function (ch) { return /[a-zа-яіїєґ0-9%]/i.test(ch); })
      .join('');
  }
  var col = {};
  headers.forEach(function (h, i) { col[normKey(h)] = i; }); // 0-based index into `out`

  var durationSeconds = Number(data.durationSeconds) || 0;
  var activeSeconds = Number(data.activeTimeSeconds) || 0;
  var passed = !!data.passed;

  var out = new Array(lastCol).fill('');
  function setCol(name, value) {
    var key = normKey(name);
    if (key in col) out[col[key]] = value;
  }
  setCol('Timestamp', new Date());
  setCol('Session ID', String(data.sessionId || ''));
  setCol('SV', String(data.svEmail || ''));
  setCol('User_Id', String(data.userId || ''));
  setCol('Назва курсу', String(data.courseName || ''));
  setCol('Початок курсу', data.startedAt ? new Date(data.startedAt) : '');
  setCol('Завершення курсу', data.completedAt ? new Date(data.completedAt) : '');
  setCol('Тривалість', formatMmSs(durationSeconds));
  setCol('Активний час', formatMmSs(activeSeconds));
  setCol('Балів набрано', Number(data.scoreRaw) || 0);
  setCol('Балів максимум', Number(data.scoreMax) || 0);
  setCol('Результат %', Number(data.scorePercent) || 0);
  setCol('Тест складено', passed ? 'Так' : 'Ні');
  setCol('Найдовша серія', Number(data.longestCorrectStreak) || 0);
  // "Кубок Виконання" навмисно не займаємо — немає відповідного джерела даних.

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, lastCol).setValues([out]);

  return jsonResponse({ ok: true });
}

function formatMmSs(totalSeconds) {
  var s = Math.max(0, Math.round(totalSeconds));
  var mm = Math.floor(s / 60);
  var ss = s % 60;
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
