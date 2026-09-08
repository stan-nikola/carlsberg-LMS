import { Resend } from "resend";

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
 * Письмо руководителю с PIN для входа его подчинённого. Сам сотрудник PIN
 * на экране не видит — только код + имя, руководитель передаёт PIN лично.
 */
export async function sendLoginPinEmail({ to, employeeName, pin }) {
  const resend = getResendClient();
  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `PIN для входу співробітника ${employeeName}`,
    text: [
      `Співробітник ${employeeName} намагається увійти в систему навчання.`,
      "",
      `PIN-код для входу: ${pin}`,
      "",
      "Передайте цей код співробітнику особисто.",
    ].join("\n"),
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
