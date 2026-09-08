import { sendLoginPinEmail } from "@/lib/resend";
import { sendLoginPinEmailViaGmail } from "@/lib/gmail";

// Единая точка выбора почтового провайдера для PIN-писем. В проде — ЖЁСТКО
// Resend, без исключений (EMAIL_PROVIDER там не читается вообще): Gmail —
// личный аккаунт, никакого дела ему в проде нет. Вне прода — можно
// переключиться на Gmail через EMAIL_PROVIDER=gmail в .env, пока свой
// домен в Resend не подтверждён (см. lib/resend.js про sandbox-режим).
export async function sendLoginPin(params) {
  const provider = process.env.NODE_ENV === "production" ? "resend" : process.env.EMAIL_PROVIDER || "resend";

  if (provider === "gmail") {
    return sendLoginPinEmailViaGmail(params);
  }
  return sendLoginPinEmail(params);
}
