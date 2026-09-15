import fs from "node:fs";
import path from "node:path";
import { PLATFORM_SHORT_NAME, PLATFORM_ABBREVIATION_EXPANSION, PLATFORM_TAGLINE, PLATFORM_HOP_LOGO_PATH } from "@/lib/branding";

/**
 * Єдиний шаблон PIN-листа для обох поштових провайдерів (lib/resend.js і
 * lib/gmail.js) — раніше текст був продубльований у кожному з них, і
 * будь-яка правка формулювання вимагала двох однакових змін. Тепер
 * провайдер лише транспорт: бере готові subject/text/html/логотип звідси.
 *
 * Чому HTML верстається таблицями з інлайновими стилями, а не класами:
 * поштові клієнти (Outlook, Gmail) не підтримують <style>/flex/grid
 * стабільно — таблиці + inline CSS єдина розкладка, що виглядає однаково
 * скрізь. Кольори — ті самі, що в app/styles/tokens.css (--cb-primary
 * #00321e, --cb-secondary #17b169, --cb-support-20/40/100, --cb-black),
 * продубльовані буквально, бо CSS-змінних у листі теж немає. Кути без
 * заокруглення — той самий Malty-принцип, що й у застосунку.
 *
 * Логотип — inline-вкладення (CID), а не <img src="https://…">: публічного
 * URL застосунку в env немає, а localhost із поштової скриньки не
 * відкриється. Файл читається з диска один раз на процес. Якщо його
 * раптом немає — лист усе одно йде, просто без картинки: декоративний
 * асет не має права зламати доставку PIN.
 */

/** 12 годин — те саме, що PIN_TTL_MS у lib/auth.js (імпортувати звідти не
 * можна: lib/auth.js сам імпортує mailer → циклічна залежність). */
const PIN_TTL_LABEL = "12 годин";

const LOGO_CID = "carls-logo";

const FONT = "Montserrat, Arial, Helvetica, sans-serif";
const COLOR_PRIMARY = "#00321e";
const COLOR_ACCENT = "#17b169";
const COLOR_BLACK = "#212833";
const COLOR_SOFT = "#314550";
const COLOR_BG = "#f0f2f3";
const COLOR_LINE = "#d7e0e2";

export type LoginPinEmailParams = {
  /** Employee.name з бази (для польових ролей — заглушка з посади). */
  employeeName: string;
  externalCode: string;
  /** Те, що людина ввела в "Ваше ім'я" на екрані входу. Untrusted. */
  enteredName?: string;
  pin: string;
  /** true — лист самому співробітнику, false — його керівнику. */
  isSelf: boolean;
};

export type LoginPinEmail = {
  subject: string;
  text: string;
  html: string;
  /** Inline-логотип для вкладення; null, якщо файл недоступний. */
  logo: { filename: string; content: Buffer; cid: string } | null;
};

/** Мінімальне екранування для вставки untrusted-рядків у HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let cachedLogo: LoginPinEmail["logo"] | undefined;

function loadLogo(): LoginPinEmail["logo"] {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    // turbopackIgnore — те саме, що в certificate/route.js: не трасувати весь проект.
    const filePath = path.join(/* turbopackIgnore: true */ process.cwd(), "public", PLATFORM_HOP_LOGO_PATH);
    cachedLogo = { filename: path.basename(filePath), content: fs.readFileSync(filePath), cid: LOGO_CID };
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

export function buildLoginPinEmail(params: LoginPinEmailParams): LoginPinEmail {
  const { employeeName, externalCode, pin, isSelf } = params;
  const enteredName = (params.enteredName || "").trim();
  const logo = loadLogo();

  const subject = isSelf
    ? `${PLATFORM_SHORT_NAME} · Ваш PIN для входу`
    : `${PLATFORM_SHORT_NAME} · PIN для входу співробітника ${employeeName}`;

  // ---- Plain text (для клієнтів без HTML і як fallback) ----
  const text = isSelf
    ? [
        `Ваш PIN-код для входу в систему навчання: ${pin}`,
        "",
        `Код співробітника: ${externalCode}`,
        ...(enteredName ? [`Введене ім'я: ${enteredName}`] : []),
        `Код дійсний ${PIN_TTL_LABEL}.`,
        "",
        "Нікому його не передавайте.",
        "",
        `— команда ${PLATFORM_SHORT_NAME}`,
      ].join("\n")
    : [
        `Співробітник ${employeeName} (код ${externalCode}) намагається увійти в систему навчання.`,
        ...(enteredName ? [`Введене ім'я: ${enteredName}`] : []),
        "",
        `PIN-код для входу: ${pin}`,
        `Код дійсний ${PIN_TTL_LABEL}.`,
        "",
        "Передайте цей код співробітнику особисто.",
        "",
        `— команда ${PLATFORM_SHORT_NAME}`,
      ].join("\n");

  // ---- HTML ----
  const e = escapeHtml;
  const heading = isSelf ? "Ваш код для входу" : "Запит на вхід співробітника";
  const intro = isSelf
    ? "Ви запросили вхід у систему навчання. Введіть цей код на екрані входу:"
    : `Співробітник <strong style="color:${COLOR_PRIMARY};">${e(employeeName)}</strong> запросив вхід у систему навчання. Передайте йому цей код особисто:`;
  const caution = isSelf
    ? "Нікому не передавайте цей код. Якщо ви не запитували вхід — просто проігноруйте лист."
    : "Код призначений лише для цього співробітника. Якщо запит вам незнайомий — не передавайте його.";

  const detailRow = (label: string, value: string) =>
    `<tr>
      <td style="padding:6px 0;font-family:${FONT};font-size:13px;color:${COLOR_SOFT};width:160px;">${label}</td>
      <td style="padding:6px 0;font-family:${FONT};font-size:13px;color:${COLOR_BLACK};font-weight:600;">${value}</td>
    </tr>`;

  const logoCell = logo
    ? `<img src="cid:${LOGO_CID}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0;margin:0 auto 10px;">`
    : "";

  const html = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR_BG};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${COLOR_BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${COLOR_LINE};">
        <tr>
          <td style="height:5px;background:${COLOR_PRIMARY};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 32px 8px;">
            ${logoCell}
            <div style="font-family:${FONT};font-size:22px;font-weight:800;color:${COLOR_PRIMARY};line-height:1.2;">${e(PLATFORM_SHORT_NAME)}</div>
            <div style="font-family:${FONT};font-size:12px;color:${COLOR_SOFT};letter-spacing:0.02em;">${e(PLATFORM_ABBREVIATION_EXPANSION)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="font-family:${FONT};font-size:18px;font-weight:700;color:${COLOR_BLACK};line-height:1.35;">${heading}</div>
            <p style="margin:10px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${COLOR_BLACK};">${intro}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td align="center" style="background:${COLOR_BG};border-left:4px solid ${COLOR_ACCENT};padding:20px 16px;">
                  <div style="font-family:${FONT};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${COLOR_SOFT};margin-bottom:6px;">PIN-код</div>
                  <div style="font-family:'IBM Plex Mono',Consolas,'Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:${COLOR_PRIMARY};line-height:1;padding-left:10px;">${e(pin)}</div>
                  <div style="font-family:${FONT};font-size:12px;color:${COLOR_SOFT};margin-top:10px;">Дійсний ${PIN_TTL_LABEL}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${COLOR_LINE};border-bottom:1px solid ${COLOR_LINE};padding:4px 0;">
              ${detailRow("Код співробітника", e(externalCode))}
              ${enteredName ? detailRow("Введене ім'я", e(enteredName)) : ""}
              ${!isSelf ? detailRow("У базі", e(employeeName)) : ""}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px;">
            <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.55;color:${COLOR_SOFT};">${caution}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 24px;background:${COLOR_BG};border-top:1px solid ${COLOR_LINE};">
            <div style="font-family:${FONT};font-size:13px;font-weight:600;color:${COLOR_PRIMARY};">З повагою, команда ${e(PLATFORM_SHORT_NAME)}</div>
            <div style="font-family:${FONT};font-size:12px;color:${COLOR_SOFT};margin-top:4px;">${e(PLATFORM_TAGLINE)}</div>
            <div style="font-family:${FONT};font-size:11px;color:${COLOR_SOFT};margin-top:12px;opacity:0.8;">Це автоматичний лист — відповідати на нього не потрібно.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, text, html, logo };
}
