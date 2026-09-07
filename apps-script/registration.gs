/**
 * Carlsberg LMS — реєстрація через User_Id + PIN на пошту керівника (SV).
 *
 * Працює з вкладкою "Users" тієї самої Google Таблиці, куди пишуться й
 * результати курсів (RESULTS_WEBHOOK_URL — окремий скрипт, вкладка
 * "Results"). Колонки на вкладці "Users" (порядок не важливий —
 * скрипт читає їх за назвою заголовка в першому рядку):
 *
 *   Email_SV | User_Id | User_key | User_Name | last_action
 *
 * Флоу:
 *   1) action:"register"  { userId, name }
 *      → шукає рядок за User_Id. Якщо User_key ще порожній — генерує
 *        СТАТИЧНИЙ 4-значний PIN і записує в User_key назавжди (не
 *        одноразовий); якщо PIN вже є — просто пересилає той самий,
 *        не змінюючи його. Надсилає лист із PIN на Email_SV.
 *   2) action:"confirm"    { userId, name, pin }
 *      → звіряє pin з User_key. Якщо збігається — записує User_Name і
 *        last_action (поточний час); User_key НЕ чіпає — той самий PIN
 *        лишається дійсним і для наступних входів (з інших пристроїв
 *        тощо). Повертає svEmail для показу в профілі.
 *
 * Лист надсилається через MailApp під вашим Google-акаунтом — це єдиний
 * спосіб робити це з Apps Script без платного Workspace-домену. Змінити
 * можна лише ВІДОБРАЖУВАНЕ ім'я відправника (нижче — "Carlsberg Academy"),
 * сама адреса в заголовку листа лишається вашою gmail/акаунтною адресою.
 *
 * ==================== ДЕПЛОЙ (зробити один раз) ====================
 *  1. Відкрийте Google Таблицю (той самий файл, що для результатів тестів).
 *  2. Розширення → Apps Script.
 *  3. Створіть НОВИЙ файл скрипта (не перезаписуйте той, що відповідає за
 *     результати тестів) і вставте сюди весь вміст цього файлу.
 *  4. У SPREADSHEET_ID нижче підставте ID вашої таблиці (він уже вписаний —
 *     це той самий файл, з якого читалась структура вкладки Users).
 *  5. Розгорнути → Нове розгортання → тип "Веб-застосунок":
 *       - Execute as: Me (ваш акаунт)
 *       - Who has access: Anyone (обов'язково "Anyone", інакше запити з
 *         браузера користувачів будуть відхилені)
 *  6. Скопіюйте видану /exec URL-адресу.
 *  7. Вставте цю адресу як REG_WEBHOOK_URL у js/registration.js
 *  8. Перше розгортання попросить підтвердити дозволи (надсилання листів
 *     від вашого імені через MailApp) — підтвердіть.
 */

var SPREADSHEET_ID = '1KOD9Ut-5rK35GHwZ5hbsAM1UWq0KsM5xH2HGC4gNa1U';
var USERS_SHEET_NAME = 'Users';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET_NAME);
    if (!sheet) return jsonResponse({ ok: false, error: 'sheet_not_found' });

    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var colEmailSv = headers.indexOf('Email_SV');
    var colUserId  = headers.indexOf('User_Id');
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

    if (action === 'register') {
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

    if (action === 'confirm') {
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
  } catch (err) {
    return jsonResponse({ ok: false, error: 'server_error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
