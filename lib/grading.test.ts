import { describe, expect, it } from "vitest";
import { gradeLocally, gradeResponse, indexKeyOf, publicContent, revealContent, seededRandom } from "./grading";

const quiz = {
  questionType: "multi",
  explanation: "Загальний розбір",
  options: [
    { text: "A", correct: true, explanation: "так" },
    { text: "B", correct: false, explanation: "ні" },
    { text: "C", correct: true },
  ],
};

describe("publicContent не видає відповідей", () => {
  it("quiz: без correct і пояснень, з key", () => {
    const pub = publicContent("quiz", quiz, indexKeyOf, "1");
    const json = JSON.stringify(pub);
    expect(json).not.toContain("correct");
    expect(json).not.toContain("explanation");
    expect(pub.options).toEqual([
      { key: "o0", text: "A" },
      { key: "o1", text: "B" },
      { key: "o2", text: "C" },
    ]);
    expect(pub.__public).toBe(true);
  });

  it("ordering: кроки перемішано й гарантовано НЕ в правильному порядку", () => {
    const content = { items: [{ text: "1" }, { text: "2" }] };
    for (let seed = 0; seed < 20; seed++) {
      const pub = publicContent("ordering", content, indexKeyOf, String(seed)) as { items: { key: string }[] };
      expect(pub.items.map((i) => i.key)).not.toEqual(["s0", "s1"]);
    }
  });

  it("matching: праві частини окремо й перемішані, пар у вмісті нема", () => {
    const content = { pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }, { left: "L3", right: "R3" }] };
    const pub = publicContent("matching", content, indexKeyOf, "7") as { pairs?: unknown; rights: { key: string }[] };
    expect(pub.pairs).toBeUndefined();
    expect(pub.rights.map((r) => r.key)).not.toEqual(["r0", "r1", "r2"]);
  });

  it("hotspot: зон немає", () => {
    const pub = publicContent("hotspot", { zones: [{ x: 1, y: 1, r: 5 }], explanation: "e", images: [] }, indexKeyOf, "1");
    expect(pub.zones).toBeUndefined();
    expect(pub.explanation).toBeUndefined();
  });

  it("однаковий seed — однаковий порядок (відновлення сесії не тасує заново)", () => {
    const content = { items: [{ text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }] };
    expect(publicContent("ordering", content, indexKeyOf, "abc")).toEqual(publicContent("ordering", content, indexKeyOf, "abc"));
  });
});

describe("gradeResponse", () => {
  it("quiz multi: лише точний набір правильних", () => {
    expect(gradeResponse("quiz", quiz, { selected: ["o0", "o2"] }, indexKeyOf)).toBe(true);
    expect(gradeResponse("quiz", quiz, { selected: ["o2", "o0"] }, indexKeyOf)).toBe(true);
    expect(gradeResponse("quiz", quiz, { selected: ["o0"] }, indexKeyOf)).toBe(false);
    expect(gradeResponse("quiz", quiz, { selected: ["o0", "o1", "o2"] }, indexKeyOf)).toBe(false);
    expect(gradeResponse("quiz", quiz, { selected: ["o0", "o0"] }, indexKeyOf)).toBe(false);
  });

  it("ordering і matching", () => {
    const steps = { items: [{ text: "a" }, { text: "b" }, { text: "c" }] };
    expect(gradeResponse("ordering", steps, { order: ["s0", "s1", "s2"] }, indexKeyOf)).toBe(true);
    expect(gradeResponse("ordering", steps, { order: ["s1", "s0", "s2"] }, indexKeyOf)).toBe(false);
    const pairs = { pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }] };
    expect(gradeResponse("matching", pairs, { links: { l0: "r0", l1: "r1" } }, indexKeyOf)).toBe(true);
    expect(gradeResponse("matching", pairs, { links: { l0: "r1", l1: "r0" } }, indexKeyOf)).toBe(false);
  });

  it("hotspot: влучання в зону", () => {
    const content = { zones: [{ x: 50, y: 50, r: 10 }] };
    expect(gradeResponse("hotspot", content, { x: 52, y: 51, aspect: 1 }, indexKeyOf)).toBe(true);
    expect(gradeResponse("hotspot", content, { x: 5, y: 5, aspect: 1 }, indexKeyOf)).toBe(false);
  });

  it("сміття замість відповіді — false, а не виняток", () => {
    expect(gradeResponse("quiz", quiz, null, indexKeyOf)).toBe(false);
    expect(gradeResponse("ordering", { items: [{ text: "a" }] }, { order: "s0" }, indexKeyOf)).toBe(false);
    expect(gradeResponse("hotspot", { zones: [] }, { x: "a" }, indexKeyOf)).toBe(false);
    expect(gradeResponse("info", {}, {}, indexKeyOf)).toBe(false);
  });

  it("key з іншого джерела (підробка індексу) не зараховується", () => {
    const hmacLike = (kind: string, i: number) => `${kind}-secret-${i}`;
    expect(gradeResponse("quiz", quiz, { selected: ["o0", "o2"] }, hmacLike)).toBe(false);
  });
});

describe("revealContent / gradeLocally", () => {
  it("розбір містить правильні варіанти й пояснення", () => {
    const r = revealContent("quiz", quiz, indexKeyOf) as { options: { correct: boolean; explanation?: string }[]; explanation: string };
    expect(r.options.map((o) => o.correct)).toEqual([true, false, true]);
    expect(r.options[1].explanation).toBe("ні");
    expect(r.explanation).toBe("Загальний розбір");
  });

  it("прев'ю: перевірка тим самим кодом", () => {
    expect(gradeLocally("quiz", quiz, { selected: ["o0", "o2"] }).correct).toBe(true);
  });
});

it("seededRandom детермінований і в межах [0,1)", () => {
  const a = seededRandom("x");
  const b = seededRandom("x");
  for (let i = 0; i < 50; i++) {
    const v = a();
    expect(v).toBe(b());
    expect(v >= 0 && v < 1).toBe(true);
  }
});
