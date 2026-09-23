import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import {
  PLATFORM_NAME,
  PLATFORM_SHORT_NAME,
  PLATFORM_ABBREVIATION_EXPANSION,
} from "@/lib/branding";

/**
 * Картинка-прев'ю посилання (Open Graph) — те, що бачить людина, коли
 * хтось кидає їй https://…/register у Telegram/Viber/Slack.
 *
 * Доти жодного og:image не було взагалі, і месенджер брав ПЕРШУ картинку
 * зі сторінки — нею виявилась підказка «де взяти код» (скрін Monolit
 * Agent, public/assets/monolit-code-hint.png): посилання на платформу
 * виглядало як інструкція до чужого застосунку (скарга користувача,
 * 2026-09-23). Тепер це вітальний екран — той самий, що людина побачить
 * першим, ДО інструкції зі встановлення (WelcomeScreen у
 * app/register/page.js): знак, назва, гасло, три пункти й «Почати».
 *
 * Тексти навмисно продубльовані з WelcomeScreen, а не імпортовані: там
 * вони живуть усередині JSX клієнтського екрана разом із версткою, і
 * витягати їх заради картинки означало б розібрати той екран на частини.
 * Якщо міняється текст привітання — поміняти і тут (один екран, три
 * рядки).
 *
 * Файлова конвенція App Router: лежить у КОРЕНІ app/, тож діє на всі
 * маршрути, яким не задано власної картинки (зокрема /register).
 * Шрифт — ті самі TTF, що вже возять PDF-сертифікати (satori не приймає
 * woff2, тож фірмові public/fonts/carlsberg/*.woff2 тут не годяться).
 */
export const alt = PLATFORM_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#00321E";
const FEATURES = [
  { text: "Курси у зручному форматі", icon: <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /> },
  {
    text: "З будь-якого пристрою — телефон, планшет, комп’ютер",
    // <g>, а не фрагмент: satori не розуміє React.Fragment усередині SVG.
    icon: (
      <g>
        <rect x="3" y="7" width="14" height="14" rx="1.5" />
        <path d="M7 7V4.5A1.5 1.5 0 0 1 8.5 3H19.5A1.5 1.5 0 0 1 21 4.5V15.5A1.5 1.5 0 0 1 19.5 17H17" />
      </g>
    ),
  },
  { text: "Досягнення та рейтинг команди", icon: <path d="M12 3 14.6 8.6 20.7 9.4 16.2 13.6 17.4 19.7 12 16.9 6.6 19.7 7.8 13.6 3.3 9.4 9.4 8.6Z" /> },
];

export default async function OpengraphImage() {
  const [bold, regular, logo] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/og/Montserrat-Bold.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/og/Montserrat-Regular.ttf")),
    readFile(path.join(process.cwd(), "public/assets/brand/trefoil-solid-green.png")),
  ]);
  // satori не ходить по мережі за <img src="/…"> — картинку віддаємо
  // вбудованою в саму розмітку.
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // Той самий м'який зелений градієнт, що на екрані привітання.
          background: "linear-gradient(135deg, #f4faf6 0%, #ffffff 45%, #eaf5ee 100%)",
          fontFamily: "Montserrat",
          padding: "40px 64px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" width={92} height={85} />
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, color: GREEN, marginTop: 10, letterSpacing: -1 }}>
          {PLATFORM_SHORT_NAME}
        </div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 400, color: "#41544b", marginTop: 10 }}>
          {PLATFORM_ABBREVIATION_EXPANSION}
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: GREEN, marginTop: 24 }}>
          Вітаємо в {PLATFORM_SHORT_NAME}!
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            fontWeight: 400,
            color: "#5d6f66",
            marginTop: 12,
            maxWidth: 780,
            textAlign: "center",
            lineHeight: 1.35,
          }}
        >
          Платформа, яка об’єднує курси, прогрес, відзнаки та рейтинг команди в одному місці — більше, ніж просто
          навчання.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
          {FEATURES.map((f) => (
            <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  background: "rgba(23, 177, 105, 0.12)",
                }}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </div>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 400, color: "#2f3f38" }}>{f.text}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 30,
            width: 420,
            padding: "18px 0",
            borderRadius: 999,
            background: GREEN,
            color: "#ffffff",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          Почати
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Montserrat", data: bold, weight: 700, style: "normal" },
        { name: "Montserrat", data: regular, weight: 400, style: "normal" },
      ],
    }
  );
}
