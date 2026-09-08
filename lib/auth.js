import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendLoginPinEmail } from "@/lib/resend";

function generatePin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
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
 * Возвращает текущий PIN сотрудника, генерируя новый только если его ещё
 * нет — PIN статичный, как в legacy: повторная отправка шлёт тот же код,
 * а не новый.
 */
async function getOrCreatePin(employee) {
  if (employee.loginPin) return employee.loginPin;

  const pin = generatePin();
  await prisma.employee.update({
    where: { id: employee.id },
    data: { loginPin: pin, pinIssuedAt: new Date() },
  });
  return pin;
}

/**
 * Шаг 1 входа: находит сотрудника по externalCode и отправляет PIN на
 * почту его руководителя (employee.manager.email) — сам сотрудник PIN
 * никогда не видит на экране.
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
  if (!employee.manager || !employee.manager.email) {
    return { ok: false, error: "no_manager_email" };
  }

  const pin = await getOrCreatePin(employee);
  try {
    await sendLoginPinEmail({
      to: employee.manager.email,
      employeeName: employee.name,
      pin,
    });
  } catch (err) {
    // PIN уже згенеровано і збережено - лист просто не пішов (Resend
    // впав/ліміт/акаунт ще в тестовому режимі). Кажемо про це чесно,
    // а не повертаємо ok:true, як було до цього фіксу.
    return { ok: false, error: "email_send_failed", message: err.message };
  }

  return { ok: true };
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
