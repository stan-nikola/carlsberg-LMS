import crypto from "node:crypto";

/**
 * Одноразове посилання на Excel-звіт керівника (2026-10-03). У встановленому
 * на iPhone застосунку файл відкривається в окремому вікні Safari з кнопкою
 * «Готово» (target=_blank), а в того вікна СВОЇ cookie — сесії застосунку там
 * немає, і сервер відповідав «нема доступу» (порожнє вікно, скарга
 * користувача). Тож у посиланні — підписаний ключ замість cookie:
 *  - живе EXPORT_LINK_TTL_MS;
 *  - прив'язаний до людини й Employee.sessionVersion — вихід/відкликання
 *    сесії адміном робить його недійсним (перевіряє сам роут експорту);
 *  - діє лише на /api/manager/export (окремий префікс у підписі, не
 *    підходить як cookie сесії і навпаки).
 */
export const EXPORT_LINK_TTL_MS = 10 * 60 * 1000;

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(`manager-export:${payload}`).digest("base64url");
}

export function signExportToken(employeeId: number, sessionVersion: number, now = Date.now()): string {
  const payload = `${employeeId}.${sessionVersion}.${now + EXPORT_LINK_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyExportToken(token: unknown, now = Date.now()): { employeeId: number; sessionVersion: number } | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, version, exp, signature] = parts;
  const expected = Buffer.from(sign(`${id}.${version}.${exp}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const employeeId = Number(id);
  const sessionVersion = Number(version);
  if (!Number.isInteger(employeeId) || employeeId <= 0 || !Number.isInteger(sessionVersion) || !(Number(exp) > now)) return null;
  return { employeeId, sessionVersion };
}
