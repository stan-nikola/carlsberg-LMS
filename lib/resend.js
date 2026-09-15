import { Resend } from "resend";
import { buildLoginPinEmail } from "@/lib/emailTemplates";

// RESEND_API_KEY нужно завести самостоятельно в .env (аккаунт на resend.com,
// см. чат) — сюда его не вписываю. Клиент создаётся лениво (не при импорте
// модуля), иначе отсутствие ключа ломает `next build` ещё до того, как
// кто-то реально попробует отправить письмо.
function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

// Тестовый домен Resend — работает без подтверждения своего домена и шлёт
// куда угодно, но письма приходят от resend.dev. Как подтвердите свой домен
// в Resend (DNS/DKIM/SPF), задайте RESEND_FROM_EMAIL с адресом на нём.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

/**
 * PIN для входу. Два варіанти листа залежно від адресата (див.
 * lib/auth.js requestLoginPin):
 * - isSelf=true: іде самому співробітнику (у нього є особиста пошта) -
 *   лист напряму "ваш PIN".
 * - isSelf=false: іде керівнику (у співробітника особистої пошти нема) -
 *   лист із проханням передати код підлеглому особисто, як і раніше.
 */
export async function sendLoginPinEmail({ to, ...params }) {
  const resend = getResendClient();
  // Текст/HTML/логотип — спільний шаблон lib/emailTemplates.ts (той
  // самий, що в lib/gmail.js); тут лише транспорт.
  const { subject, text, html, logo } = buildLoginPinEmail(params);
  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    text,
    html,
    // Inline-логотип: у HTML він <img src="cid:…">, тут — вкладення з тим
    // самим contentId (SDK сам перекладає в content_id для API).
    ...(logo ? { attachments: [{ filename: logo.filename, content: logo.content, contentId: logo.cid }] } : {}),
  });

  // Resend SDK не кидає виняток на помилку API — повертає { data: null,
  // error }. Без цієї перевірки requestLoginPin() мовчки повертав би
  // ok:true навіть коли лист реально не пішов (знайдено живим тестуванням:
  // тестовий Resend-акаунт шле тільки на пошту власника акаунта, поки не
  // підтверджено домен — усі інші адресати падають з 403, і про це
  // ніхто не дізнавався).
  if (result.error) {
    throw new Error(`Resend: ${result.error.message || result.error.name || "send failed"}`);
  }

  return result;
}
