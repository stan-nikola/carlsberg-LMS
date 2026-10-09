import crypto from "node:crypto";

/**
 * PIN входу в базі — зашифрований (AES-256-GCM), не відкритим текстом
 * (аудит безпеки 2026-10-07): витік однієї бази чи бекапу не розкриває
 * дійсні PIN. Шифрування, а не хеш, — свідомо: повторний запит за 10 хвилин
 * має надіслати ТОЙ САМИЙ PIN (lib/auth.js createPin), інакше будь-хто, хто
 * знає чужий код, запитами збивав би справжній PIN і людина не могла б увійти.
 *
 * Ключ — HKDF від SESSION_SECRET: окремої змінної середовища не треба.
 * Ротація SESSION_SECRET робить видані PIN недійсними (живуть 12 год) — так і треба.
 */
const PREFIX = "e1:";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return Buffer.from(crypto.hkdfSync("sha256", secret, "", "carls-login-pin", 32));
}

/** PIN → рядок для Employee.loginPin. */
export function sealPin(pin: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

/**
 * Employee.loginPin → PIN, або null, якщо значення пошкоджене чи зашифроване
 * іншим ключем. Значення без префікса — PIN, виданий до шифрування: повертається
 * як є, щоб він дожив свої 12 годин.
 * ponytail: гілку відкритого тексту прибрати, коли всі такі PIN прострочаться.
 */
export function openPin(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
