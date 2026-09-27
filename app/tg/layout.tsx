import Script from "next/script";
import "@/app/styles/tg.css";

/**
 * Mini App CarLS — той самий сайт, показаний у вебʼю Telegram (2026-09-28,
 * рішення користувача: лише читання — дедлайни/курси/команда — і одна
 * швидка дія «Нагадати»; ні входу, ні проходження курсу тут немає).
 *
 * Не корінний layout — успадковує <html>/<body>, шрифти й токени дизайну
 * з app/layout.js, лише додає SDK-скрипт Telegram і власний, вузько
 * скопований styles/tg.css (не в globals.css — щоб не роздувати решту
 * застосунку заради єдиного маршруту).
 *
 * strategy="beforeInteractive" тут НЕ підходить: за докою next/script вона
 * дозволена лише в корінному layout (app/layout.js) — у вкладеному (цей
 * файл) Next її мовчки ігнорує, скрипт узагалі не підвантажується (живий
 * тест на проді, 2026-09-28: у мережевих запитах telegram.org не було
 * зовсім, і без жодної помилки в консолі). "afterInteractive" — те, що
 * дозволено тут; сторінка (app/tg/page.tsx) через це не читає
 * window.Telegram.WebApp одразу в ефекті при монтуванні, а чекає, поки
 * скрипт реально довантажиться (опитуванням, без жорсткого зв'язку з
 * конкретним layout-компонентом).
 */
export default function TelegramMiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <div className="tg-root">{children}</div>
    </>
  );
}
