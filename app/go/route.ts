import { NextRequest } from "next/server";

/**
 * Проміжна сторінка для кнопки «Відкрити» в Telegram-сповіщеннях
 * (lib/telegram.ts) — не сама ціль, а обгортка навколо неї.
 *
 * Проблема (скарга користувача, 2026-09-28): пряме посилання на курс з
 * Telegram відкривало звичайну вкладку браузера замість встановленого
 * PWA. Причина в двох різних місцях:
 *  - Android: система сама відкриває встановлений PWA (WebAPK) замість
 *    браузера для посилань у його scope — АЛЕ лише якщо перехід іде через
 *    системне розпізнавання посилань. Вбудований браузер Telegram (той
 *    самий Android WebView, що й у решти застосунків з "in-app browser")
 *    рендерить сторінку САМ, в обхід ОС, і до цього розпізнавання просто
 *    не доходить. Android WebView (і Telegram зокрема) при цьому виконує
 *    навігацію на `intent://` — це стандартний, широко вживаний спосіб
 *    "вирватись" із чужого вбудованого браузера в Chrome; Chrome вже сам
 *    віддає посилання встановленому PWA за правилами Android.
 *  - iOS: Safari-застосунки з "На екран Домой" НЕ вміють перехоплювати
 *    посилання, відкриті з інших застосунків, — це обмеження самої
 *    платформи, жодним кодом на сайті не обходиться (підтверджено
 *    користувачем: на iPhone відкривається саме у вбудованому браузері
 *    Telegram). Спроба все одно кудись перейти лише пересаджує людину в
 *    ЩЕ ОДИН ізольований контекст (свій набір cookie/localStorage — не
 *    той, що в інстальованому PWA) і виглядає як нова реєстрація на
 *    порожньому місці (рішення користувача, 2026-09-28: краще взагалі не
 *    давати натиснути, ніж давати клікабельне посилання в нікуди). Тут —
 *    лише текст, жодного <a href> і жодного автопереходу.
 *  - Android і десктоп: жодної додаткової перевірки "чи встановлено" не
 *    потрібно — це вже вирішує сам браузер. На Android intent-перехід
 *    (нижче) веде в Chrome, а Chrome сам віддає посилання інстальованому
 *    PWA, якщо воно є, і просто показує сторінку, якщо нема. На
 *    комп'ютері Telegram Desktop і так завжди відкриває посилання в
 *    системному браузері за замовчуванням (не у власному вбудованому
 *    вікні), а сучасний Chrome/Edge (139+, 2024+) сам підхоплює
 *    інстальований PWA за той самий принцип — це нативна поведінка
 *    браузера, перевірено, не вигадане.
 */
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to");
  // Лише той самий origin — інакше /go стає відкритим редиректом (open
  // redirect): хтось міг би розіслати посилання на наш довірений домен,
  // яке насправді веде на фішинговий сайт.
  const isSameOrigin = (() => {
    if (!to) return false;
    try {
      return new URL(to).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  })();
  const target = isSameOrigin ? to! : `${request.nextUrl.origin}/hub`;
  const ua = request.headers.get("user-agent") || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  const withoutScheme = target.replace(/^https?:\/\//, "");
  const intentUrl = `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;end`;

  // iOS — без посилання і без автопереходу взагалі: обидва варіанти
  // однаково ведуть у чужий ізольований контекст, що виглядає як збій.
  const body = isIOS
    ? `<p>Це повідомлення від CarLS.</p>
  <p>Відкрийте застосунок CarLS зі свого головного екрана — усе, що потрібно, вже чекає там.</p>`
    : `<p>Відкриваємо застосунок…</p>
  <p>Якщо нічого не сталось за кілька секунд — <a id="fallback" href="${target}">натисніть тут</a>.</p>
  <script>
    ${isAndroid
      ? `location.replace(${JSON.stringify(intentUrl)});
    setTimeout(function () { location.replace(${JSON.stringify(target)}); }, 1500);`
      : `location.replace(${JSON.stringify(target)});`}
  </script>`;

  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Відкриття…</title>
<style>
  body { font-family: system-ui, sans-serif; text-align: center; padding: 48px 24px; color: #1a1a1a; }
  a { color: #00321E; }
  p { max-width: 380px; margin: 12px auto; line-height: 1.5; }
</style>
<body>
  ${body}
</body>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
