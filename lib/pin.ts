/**
 * Довжина PIN для входу співробітника (2026-10-05: 6 цифр, було 4).
 * Одне джерело для генератора (lib/auth.js), поля вводу і підказки на
 * /register — щоб довжина ніде не розійшлась. Окремий файл, бо lib/auth.js
 * тягне prisma і в клієнтський компонент не імпортується.
 */
export const PIN_LENGTH = 6;

/** Допустимий PIN: рівно PIN_LENGTH цифр (pattern в openapi.yaml — той самий). */
export const PIN_FORMAT = new RegExp(`^\\d{${PIN_LENGTH}}$`);
