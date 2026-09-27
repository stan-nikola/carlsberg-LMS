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
 * strategy="beforeInteractive" — window.Telegram.WebApp має бути готовий
 * ДО першого рендеру клієнтського компонента сторінки (app/tg/page.tsx
 * читає initData одразу в ефекті при монтуванні).
 */
export default function TelegramMiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div className="tg-root">{children}</div>
    </>
  );
}
