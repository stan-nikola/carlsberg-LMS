import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendLoginPin } from "@/lib/mailer";
import { assignFirstLoginCourses } from "@/lib/courseAssignment";
import { PIN_LENGTH } from "@/lib/pin";
import { openPin, sealPin } from "@/lib/pinCrypto";

function generatePin() {
  return String(crypto.randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
}

/** PIN живёт 12 часов с момента выдачи — дальше недействителен, нужен новый. */
const PIN_TTL_MS = 12 * 60 * 60 * 1000;
/** Повторний запит у це вікно надсилає ТОЙ САМИЙ PIN, а не новий. */
const PIN_REUSE_MS = 10 * 60 * 1000;

function pinsEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * "ivan.petrenko@carlsberg.ua" -> "Ivan Petrenko". Та сама логіка, що й
 * у prisma/import-employees.js (дубльована навмисно - той скрипт плоский
 * CommonJS без бандлера, спільний ESM-модуль з ним не заведеш без зайвих
 * складнощів заради шести рядків).
 */
function nameFromEmail(email) {
  const local = email.split("@")[0];
  return local
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Новий PIN — лише якщо попередній старший за PIN_REUSE_MS (або його нема).
 * Свіжий PIN при повторному запиті («Надіслати ще раз») надсилається той
 * самий: раніше кожен запит перезаписував код, і будь-хто, хто знав чужий
 * externalCode, міг циклом запитів тримати справжній PIN людини завжди
 * протухлим — вона просто не могла увійти (аудит 2026-09-27). Старий PIN
 * все одно протухає через PIN_TTL_MS (див. confirmLoginPin).
 */
async function createPin(employee, { forceNew = false } = {}) {
  // PIN іншої довжини (виданий до переходу 4 → 6 цифр) повторно не шлемо —
  // екран уже обіцяє 6 цифр, старий 4-значний у листі читався б як обрізаний.
  // У базі PIN зашифрований (lib/pinCrypto.ts) — для повторної відправки
  // того самого коду його розшифровуємо.
  const current = openPin(employee.loginPin);
  if (!forceNew && current && current.length === PIN_LENGTH && employee.pinIssuedAt && Date.now() - employee.pinIssuedAt.getTime() < PIN_REUSE_MS) {
    return current;
  }
  const pin = generatePin();
  await prisma.employee.update({
    where: { id: employee.id },
    data: { loginPin: sealPin(pin), pinIssuedAt: new Date() },
  });
  return pin;
}

/**
 * Шаг 1 входа: находит сотрудника по externalCode и отправляет PIN.
 *
 * Кому именно: если у сотрудника есть личная почта (менеджерский слой —
 * SV/ASM/LKAM/RM HoReCa/FSM MT/SV RKA/ТП RKA) - PIN идёт ЕМУ САМОМУ,
 * никакого смысла гонять его через руководителя, раз есть прямой канал.
 * Только если личной почты нет (полевые роли без email в источнике) -
 * PIN идёт руководителю (employee.manager.email), как единственному
 * доступному каналу связи с этим человеком.
 *
 * @param {string} externalCode
 * @param {string} [enteredName] — те, що людина ввела в "Ваше ім'я" на
 *   екрані входу. Employee.name це НЕ змінює (те поле лишається під
 *   email-правилом вище) — лише показується в PIN-листі, щоб той, хто
 *   отримує лист (сам співробітник або керівник), бачив, хто саме й під
 *   яким іменем щойно намагався увійти.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function requestLoginPin(externalCode, enteredName = "", { recipientOverride = null, forceNew = false } = {}) {
  // findFirst + mode:"insensitive", а не findUnique(externalCode) — код
  // в реальных данных хранится как ввели в CRM (в основном UPPERCASE,
  // "RNE104"), а сотрудник на экране входа может ввести его в любом
  // регистре. externalCode всё равно уникален, так что findFirst тут
  // безопасен и эквивалентен findUnique по смыслу.
  const employee = await prisma.employee.findFirst({
    where: { externalCode: { equals: externalCode, mode: "insensitive" } },
    include: { manager: true },
  });

  if (!employee) {
    return { ok: false, error: "not_found" };
  }
  if (!employee.isActive) {
    return { ok: false, error: "deactivated" };
  }

  let recipientEmail = employee.email || employee.manager?.email;
  let isSelf = Boolean(employee.email);
  // «Тестовий вхід» (lib/demoLogin.ts): лист іде на пошту, яку вказала
  // людина на екрані входу; роут уже перевірив, що код — з демо-списку.
  if (recipientOverride) {
    recipientEmail = recipientOverride;
    isSelf = true;
  }
  if (!recipientEmail) {
    return { ok: false, error: "no_manager_email" };
  }

  // Тестовый оверрайд получателя (только вне прода, только для RNE104) —
  // настоящий корпоративный email в базе не трогаем (он нужен для
  // реальной иерархии/managerId), просто переадресуем письмо на другой
  // ящик при тестировании логина этим конкретным сотрудником.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_TEST_EMAIL_OVERRIDE &&
    employee.externalCode.toUpperCase() === "RNE104"
  ) {
    recipientEmail = process.env.DEV_TEST_EMAIL_OVERRIDE;
  }

  const pin = await createPin(employee, { forceNew });

  // Поза продом дублюємо PIN у консоль сервера (де вже й так крутиться
  // `npm run dev`) - щоб не питати мене щоразу, поки Resend-акаунт у
  // тестовому режимі (шле лише на пошту власника акаунта, до
  // підтвердження домену). У проді - ніколи, PIN у логах продового
  // сервера неприпустимий.
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[dev] PIN для ${employee.externalCode} (${employee.name}) -> ${recipientEmail}${isSelf ? " (сам співробітник)" : " (керівник)"}: ${pin}`
    );
  }

  try {
    await sendLoginPin({
      to: recipientEmail,
      employeeName: employee.name,
      externalCode: employee.externalCode,
      enteredName,
      pin,
      isSelf,
    });
  } catch (err) {
    // PIN уже згенеровано і збережено - лист просто не пішов (Resend
    // впав/ліміт/акаунт ще в тестовому режимі). Кажемо про це чесно,
    // а не повертаємо ok:true, як було до цього фіксу. Текст помилки
    // провайдера — лише в лог: анонімному клієнту він розкривав би
    // внутрішню конфігурацію пошти.
    console.error("[auth] PIN email failed:", err?.message);
    return { ok: false, error: "email_send_failed" };
  }

  // isSelf — щоб екран входу (app/register/page.js) міг показати ПРАВИЛЬНЕ
  // пояснення, кому саме пішов лист: собі (менеджерський шар) чи
  // керівнику (польові ролі без email) — раніше був один загальний текст
  // "перевірте пошту, вказану в системі", що для другого випадку взагалі
  // не мав сенсу (людина сама нічого не отримає).
  return { ok: true, isSelf };
}

/**
 * Шаг 2 входа: сверяет введённый PIN с сохранённым у сотрудника.
 *
 * Имя: если у сотрудника есть email (менеджерский слой из импорта) —
 * имя всегда выводится из email на сервере, это единственный случай,
 * когда Employee.name правится тут. Если email нет (полевые роли — при
 * импорте у них вместо имени легла должность/территория) —
 * Employee.name в БД НЕ трогаем: то, что человек вводит на экране
 * входа, остаётся только на его устройстве (localStorage, см.
 * app/register/page.js) и никогда не попадает в общую базу — введённое
 * самим сотрудником имя не проверено, в отличие от email-производного.
 *
 * @param {string} externalCode
 * @param {string} pin
 * @returns {Promise<{ ok: true, employee: object } | { ok: false, error: string }>}
 */
export async function confirmLoginPin(externalCode, pin) {
  const employee = await prisma.employee.findFirst({
    where: { externalCode: { equals: externalCode, mode: "insensitive" } },
  });

  if (!employee || !employee.loginPin) {
    return { ok: false, error: "not_found" };
  }
  // Захист від "PIN видали, поки співробітник був активний, а деактивували
  // вже ПІСЛЯ" — той самий isActive-гейт, що й на кроці 1 (requestLoginPin),
  // тут повторений на випадок, якщо крок 1 колись обійдуть напряму.
  if (!employee.isActive) {
    return { ok: false, error: "deactivated" };
  }
  if (!employee.pinIssuedAt || Date.now() - employee.pinIssuedAt.getTime() > PIN_TTL_MS) {
    return { ok: false, error: "pin_expired" };
  }
  const stored = openPin(employee.loginPin);
  if (!stored || !pinsEqual(stored, pin)) {
    return { ok: false, error: "invalid_pin" };
  }

  const data = {};
  const isFirstLogin = !employee.firstLoginAt;
  if (isFirstLogin) {
    data.firstLoginAt = new Date();
  }
  if (employee.email) {
    const correctName = nameFromEmail(employee.email);
    if (employee.name !== correctName) data.name = correctName;
  }

  if (Object.keys(data).length > 0) {
    await prisma.employee.update({ where: { id: employee.id }, data });
    Object.assign(employee, data);
  }

  // Курси "для новоприбулих" — рівно тут, у момент першого успішного
  // входу. Помилка призначення НЕ має ламати сам вхід: людина вже ввела
  // правильний PIN, і залишити її за дверима через збій побічної дії
  // було б гірше за відсутній курс (він усе одно з'явиться при
  // наступному вході — виклик ідемпотентний).
  if (isFirstLogin) {
    try {
      await assignFirstLoginCourses(employee.id);
    } catch (err) {
      console.error("assignFirstLoginCourses failed for employee", employee.id, err);
    }
  }

  return { ok: true, employee };
}

/** Після серії невдалих спроб PIN анулюється — для входу потрібен новий лист. */
export async function invalidateLoginPin(externalCode) {
  await prisma.employee.updateMany({
    where: { externalCode: { equals: externalCode, mode: "insensitive" } },
    data: { loginPin: null, pinIssuedAt: null },
  });
}
