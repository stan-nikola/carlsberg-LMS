import { describe, it, expect } from "vitest";
import { renderRichText, renderRichMarks } from "@/lib/richText";

/** Плоский список дітей усіх параграфів — рендер повертає React-елементи,
 *  тут достатньо подивитись на їхній тип і вміст, без DOM.
 *  Порожні рядки відкидаємо: split із захопленням завжди лишає їх по
 *  краях збігу, і React їх усе одно не рендерить. */
function norm(kids) {
  const arr = (Array.isArray(kids) ? kids : [kids]).filter((k) => k !== "");
  // Вміст без розмітки — один рядок; із вкладеним накресленням —
  // React-елемент. Розгортаємо одинак, щоб перевірки читались просто.
  return arr.length === 1 ? arr[0] : arr;
}

function chunks(text) {
  const paragraphs = renderRichText(text);
  return paragraphs.flatMap((p) =>
    (Array.isArray(p.props.children) ? p.props.children : [p.props.children])
      .filter((k) => k !== "")
      .map((k) => (typeof k === "string" ? k : { tag: k.type, text: norm(k.props.children) }))
  );
}

describe("renderRichText", () => {
  it("розбиває на параграфи по порожньому рядку", () => {
    expect(renderRichText("перший\n\nдругий")).toHaveLength(2);
  });

  it("підтримує всі три накреслення, для яких є кнопки в конструкторі", () => {
    expect(chunks("**жирний**")).toEqual([{ tag: "strong", text: "жирний" }]);
    expect(chunks("*курсив*")).toEqual([{ tag: "em", text: "курсив" }]);
    expect(chunks("__підкреслений__")).toEqual([{ tag: "u", text: "підкреслений" }]);
  });

  // Головна пастка: **жирний** мусить перевірятись ДО *курсиву*, інакше
  // подвійні зірочки розпадуться на два окремі курсиви.
  it("подвійні зірочки не розпадаються на курсив", () => {
    expect(chunks("а **жирний** б")).toEqual(["а ", { tag: "strong", text: "жирний" }, " б"]);
  });

  // Реальний ризик для вже збереженого контенту: рядок-перелік і
  // множення не повинні перетворюватись на курсив.
  it("одиночні зірочки з пробілом поруч лишаються текстом", () => {
    expect(chunks("* пункт один * пункт два")).toEqual(["* пункт один * пункт два"]);
    expect(chunks("формула 2 * 3 * 4")).toEqual(["формула 2 * 3 * 4"]);
  });

  // Натиснути Ж, а потім К на тому самому слові — звична дія в
  // конструкторі, і вона дає саме ***слово***. Без вкладеності
  // співробітник побачив би сирі зірочки.
  it("поєднання накреслень вкладається, а не ламається", () => {
    const [boldItalic] = chunks("***разом***");
    expect(boldItalic.tag).toBe("strong");
    expect(boldItalic.text.type).toBe("em");

    const [underlinedBold] = chunks("__**разом**__");
    expect(underlinedBold.tag).toBe("u");
    expect(underlinedBold.text.type).toBe("strong");
  });

  it("порожній текст — нічого не рендерить", () => {
    expect(renderRichText("")).toBeNull();
    expect(renderRichText(null)).toBeNull();
  });
});

describe("renderRichMarks", () => {
  // Вступний рядок і пояснення до відповіді вже стоять у <p>/<span>, тож
  // сюди не можна віддавати параграфи: <p> у <p> браузер розриває.
  it("накреслення є, а параграфів немає", () => {
    const parts = renderRichMarks("а **жирний** б\n\nдалі").filter((k) => k !== "");
    expect(parts.some((k) => k?.type === "p")).toBe(false);
    expect(parts.find((k) => typeof k !== "string").type).toBe("strong");
  });

  it("порожній текст — нічого не рендерить", () => {
    expect(renderRichMarks("")).toBeNull();
    expect(renderRichMarks(null)).toBeNull();
  });
});
