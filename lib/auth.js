import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendLoginPin } from "@/lib/mailer";

function generatePin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

/** PIN живёт 12 часов с момента выдачи — дальше недействителен, нужен новый. */
const PIN_TTL_MS = 12 * 60 * 60 * 1000;

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
 * Генерирует новый PIN при КАЖДОМ запросе (в т.ч. "Надіслати ще раз") и
 * перезаписывает старый — раньше PIN был статичным (см. git-историю), но
 * это оставляло код рабочим бессрочно и без ограничения по времени.
 * Теперь старый PIN сразу же становится недействителен, как только запрошен
 * новый; сам по себе он ещё и протухает через PIN_TTL_MS (см. confirmLoginPin).
 */
async function createPin(employee) {
  const pin = generatePin();
  await prisma.employee.update({
    where: { id: employee.id },
    data: { loginPin: pin, pinIssuedAt: new Date() },
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
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function requestLoginPin(externalCode) {
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
  const isSelf = Boolean(employee.email);
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

  const pin = await createPin(employee);

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
      pin,
      isSelf,
    });
  } catch (err) {
    // PIN уже згенеровано і збережено - лист просто не пішов (Resend
    // впав/ліміт/акаунт ще в тестовому режимі). Кажемо про це чесно,
    // а не повертаємо ok:true, як було до цього фіксу.
    return { ok: false, error: "email_send_failed", message: err.message };
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
  if (employee.loginPin !== pin) {
    return { ok: false, error: "invalid_pin" };
  }

  const data = {};
  if (!employee.firstLoginAt) {
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

  return { ok: true, employee };
}
