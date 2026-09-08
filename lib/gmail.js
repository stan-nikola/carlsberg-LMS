import nodemailer from "nodemailer";

// Тестовий канал відправки листів через звичайний Gmail-акаунт (SMTP +
// App Password), в обхід обмежень Resend sandbox-режиму (той шле лише на
// пошту власника акаунта, поки не підтверджено домен — див. lib/resend.js).
// НЕ для продакшену: див. lib/mailer.js, де вибір провайдера жорстко
// заблокований на resend, коли NODE_ENV === "production".
//
// Налаштування (руками в .env, ключі сюди не пишу):
//   GMAIL_USER        - повна адреса, з якої шлемо (ваш gmail)
//   GMAIL_APP_PASSWORD - 16-символьний App Password з Google-акаунта
//     (Google Account -> Security -> 2-Step Verification -> App passwords;
//     потребує увімкненої двофакторки, звичайний пароль від акаунта тут
//     не підійде - Google його відхилить).
function getGmailTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

/** Те саме, що lib/resend.js sendLoginPinEmail - інший транспорт. */
export async function sendLoginPinEmailViaGmail({ to, employeeName, pin, isSelf }) {
  const transport = getGmailTransport();
  await transport.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject: isSelf
      ? "Ваш PIN для входу в систему навчання"
      : `PIN для входу співробітника ${employeeName}`,
    text: isSelf
      ? [`Ваш PIN-код для входу в систему навчання: ${pin}`, "", "Нікому його не передавайте."].join(
          "\n"
        )
      : [
          `Співробітник ${employeeName} намагається увійти в систему навчання.`,
          "",
          `PIN-код для входу: ${pin}`,
          "",
          "Передайте цей код співробітнику особисто.",
        ].join("\n"),
  });
}
