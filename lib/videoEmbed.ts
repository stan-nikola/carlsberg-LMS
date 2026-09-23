/**
 * Відео в курсі — це ПОСИЛАННЯ на YouTube/Vimeo, а не файл у нашому
 * сховищі (рішення користувача 2026-09-23, після спроби робити своє
 * завантаження).
 *
 * Чому так, якщо файл технічно можна залити: у нас немає чим перекодувати
 * ролик (sharp відео не вміє, ffmpeg у serverless не підняти), тож автор
 * мусив би сам дбати про кодек — і ми вже впёрлися в це: знятий телефоном
 * ролик у HEVC не грав ні в редакторі, ні гарантовано на Android. YouTube
 * робить рівно те, чого нам бракує: перекодовує в кілька якостей, роздає
 * з найближчого вузла, підбирає бітрейт під мобільну мережу поля. Плюс
 * вага курсу не росте і трафік співробітника не з'їдається нашим блобом.
 *
 * Ціна: без мережі ролик не відкриється (кадри лежать не в нас), і
 * посилання підпорядковане правилам самого сервісу.
 */

export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  id: string;
  /** Адреса для <iframe>. */
  src: string;
  title: string;
};

/**
 * Розпізнає посилання на ролик і повертає адресу для вбудованого плеєра.
 * `null` — не відео (звичайний шлях до фото або сервіс, якого не знаємо).
 *
 * Приймає всі форми, у яких посилання реально копіюють: повну адресу
 * сторінки, коротку `youtu.be`, шортси, вже-готову `embed`-адресу і просто
 * 11-символьний ідентифікатор. Автор вставляє те, що в нього в буфері, і
 * не має знати, яка з форм «правильна».
 */
export function parseVideoEmbed(raw: string): VideoEmbed | null {
  const value = (raw || "").trim();
  if (!value) return null;

  // Сирий ідентифікатор YouTube — рівно 11 символів алфавіту base64url.
  if (/^[\w-]{11}$/.test(value)) return youtube(value);

  let url: URL;
  try {
    // Без протоколу («youtube.com/watch?v=…» з адресного рядка) URL не
    // парситься — дописуємо самі, замість того щоб вимагати від автора.
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return youtube(parts[0]);
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v) return youtube(v);
    // /embed/ID, /shorts/ID, /live/ID, /v/ID — ідентифікатор завжди
    // одразу після службового сегмента.
    if (["embed", "shorts", "live", "v"].includes(parts[0])) return youtube(parts[1]);
    return null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // /123456789 або /video/123456789 (плеєрна адреса).
    const id = parts.find((p) => /^\d+$/.test(p));
    return id ? { provider: "vimeo", id, src: `https://player.vimeo.com/video/${id}`, title: "Відео Vimeo" } : null;
  }
  return null;
}

function youtube(id: string | undefined): VideoEmbed | null {
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  return {
    provider: "youtube",
    id,
    // nocookie-домен: YouTube не ставить рекламні куки, поки ролик не
    // запустили. Плеєр той самий.
    // rel=0 — після завершення пропонує ролики того ж каналу, а не
    // випадкове відео з усього YouTube посеред навчального екрана.
    src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    title: "Відео YouTube",
  };
}

/** Чи схоже це посилання на відео — для редактора, де одне поле приймає
 *  і шлях до фото, і адресу ролика. */
export function isVideoUrl(raw: string) {
  return parseVideoEmbed(raw) !== null;
}
