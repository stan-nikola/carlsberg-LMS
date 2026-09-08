import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendLoginPinEmail } from "@/lib/resend";

function generatePin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
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
  const employee = await prisma.employee.findUnique({
    where: { externalCode },
    include: { manager: true },
  });

  if (!employee) {
    return { ok: false, error: "not_found" };
  }
  if (!employee.manager || !employee.manager.email) {
    return { ok: false, error: "no_manager_email" };
  }

  const pin = await getOrCreatePin(employee);
  await sendLoginPinEmail({
    to: employee.manager.email,
    employeeName: employee.name,
    pin,
  });

  return { ok: true };
}

/**
 * Шаг 2 входа: сверяет введённый PIN с сохранённым у сотрудника.
 *
 * @param {string} externalCode
 * @param {string} pin
 * @returns {Promise<{ ok: true, employee: object } | { ok: false, error: string }>}
 */
export async function confirmLoginPin(externalCode, pin) {
  const employee = await prisma.employee.findUnique({ where: { externalCode } });

  if (!employee || !employee.loginPin) {
    return { ok: false, error: "not_found" };
  }
  if (employee.loginPin !== pin) {
    return { ok: false, error: "invalid_pin" };
  }

  return { ok: true, employee };
}
