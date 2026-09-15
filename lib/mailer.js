import { sendLoginPinEmail } from "@/lib/resend";
import { sendLoginPinEmailViaGmail } from "@/lib/gmail";

// Єдина точка вибору поштового провайдера для PIN-листів. За замовчуванням
// Resend; EMAIL_PROVIDER=gmail перемикає на Gmail SMTP (lib/gmail.js) —
// і локально, і на проді. Раніше прод був жорстко на Resend, але без
// підтвердженого домену Resend відмовляє на будь-яку адресу, крім пошти
// власника акаунта (403), а домен carlsberg.ua нам не адмініструвати
// (рішення користувача 2026-09-15: демо без домену, PIN через Gmail).
// Ліміт особистого Gmail ~500 листів/добу — для демо досить; коли
// з’явиться свій домен — прибрати EMAIL_PROVIDER у Vercel, повернеться Resend.
export async function sendLoginPin(params) {
  const provider = process.env.EMAIL_PROVIDER === "gmail" ? "gmail" : "resend";

  if (provider === "gmail") {
    return sendLoginPinEmailViaGmail(params);
  }
  return sendLoginPinEmail(params);
}
