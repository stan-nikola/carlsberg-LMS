import { describe, expect, it } from "vitest";
import { buildProgressPath, buildSnakePath } from "./snakePath";

describe("buildSnakePath — базові випадки", () => {
  it("порожньо або одна точка — лінії немає", () => {
    expect(buildSnakePath([])).toBe("");
    expect(buildSnakePath([{ x: 10, y: 10, rowBottom: 40 }])).toBe("");
  });

  it("дві точки в одному рядку — пряма лінія", () => {
    expect(
      buildSnakePath([
        { x: 50, y: 100, rowBottom: 140 },
        { x: 350, y: 100, rowBottom: 140 },
      ])
    ).toBe("M 50 100 L 350 100");
  });

  it("три точки в одному рядку — послідовні прямі", () => {
    const p = buildSnakePath([
      { x: 0, y: 0, rowBottom: 40 },
      { x: 100, y: 0, rowBottom: 40 },
      { x: 200, y: 0, rowBottom: 40 },
    ]);
    expect(p).toBe("M 0 0 L 100 0 L 200 0");
  });
});

describe("buildSnakePath — перехід рядка (розрахунок вручну)", () => {
  // Картка висока (rowBottom далеко ВІД станції) — саме той випадок, де
  // наївне "середнє Y двох станцій" потрапило б усередину картки. Середина
  // переходу тепер рахується від rowBottom попереднього ряду до Y
  // наступної станції, а не від Y попередньої станції.
  it("зліва направо в наступному рядку (dx > 0): заокруглення в обидва боки праворуч", () => {
    // prev=(50,100,rowBottom=180) картка рядка 1 висока: низ на 180.
    // cur=(350,300) станція рядка 2. Проміжок [180,300], midY=240.
    const p = buildSnakePath(
      [
        { x: 50, y: 100, rowBottom: 180 },
        { x: 350, y: 300, rowBottom: 380 },
      ],
      10
    );
    // r=min(10,(300-180)/2=60,300/2=150)=10, dir=+1
    expect(p).toBe("M 50 100 L 50 230 Q 50 240 60 240 L 340 240 Q 350 240 350 250 L 350 300");
  });

  it("типовий перенос рядка — останній стовпець рядка 1 у перший рядка 2 (dx < 0)", () => {
    const p = buildSnakePath(
      [
        { x: 350, y: 100, rowBottom: 180 },
        { x: 50, y: 300, rowBottom: 380 },
      ],
      10
    );
    // те саме, dir=-1
    expect(p).toBe("M 350 100 L 350 230 Q 350 240 340 240 L 60 240 Q 50 240 50 250 L 50 300");
  });

  it("радіус клампується під тісний вертикальний проміжок (rowBottom близько до наступної станції)", () => {
    const p = buildSnakePath(
      [
        { x: 350, y: 100, rowBottom: 200 },
        { x: 50, y: 208, rowBottom: 280 },
      ],
      10
    );
    // проміжок [200,208] -> (208-200)/2 = 4 < 10 -> r=4, midY=204
    expect(p).toContain("Q 350 204 346 204");
    expect(p).toContain("Q 50 204 50 208");
  });

  it("радіус клампується під тісний горизонтальний проміжок", () => {
    const p = buildSnakePath(
      [
        { x: 100, y: 100, rowBottom: 180 },
        { x: 106, y: 300, rowBottom: 380 },
      ],
      10
    );
    // midY=(180+300)/2=240, |dx|/2 = 3 < 10 -> r=3
    expect(p).toContain("Q 100 240 103 240");
    expect(p).toContain("Q 106 240 106 243");
  });

  it("однакова X у різних рядках (одна колонка, мобільний) — пряма без заокруглень", () => {
    const p = buildSnakePath(
      [
        { x: 100, y: 100, rowBottom: 180 },
        { x: 100, y: 300, rowBottom: 380 },
      ],
      10
    );
    expect(p).toBe("M 100 100 L 100 300");
    expect(p).not.toContain("Q");
  });

  it("немає вільного проміжку між рядками (тісна верстка) — пряма без заокруглень", () => {
    // rowBottom попереднього ряду (310) НИЖЧЕ станції наступного (300) —
    // картка "з'їдає" весь проміжок. Пряма лінія, без ділення на нуль/від'ємне.
    const p = buildSnakePath(
      [
        { x: 350, y: 100, rowBottom: 310 },
        { x: 50, y: 300, rowBottom: 380 },
      ],
      10
    );
    expect(p).toBe("M 350 100 L 50 300");
    expect(p).not.toContain("Q");
  });

  it("картки різної висоти в одному ряду (flex-wrap за контентом) — перехід рахує НАЙНИЖЧУ, не лише останню перед переносом", () => {
    // Рядок 1: перша картка низька (rowBottom=120), ОСТАННЯ перед
    // переносом — ще нижча (rowBottom=100), але десь усередині ряду є
    // висока картка з rowBottom=300. Наївний підхід узяв би rowBottom
    // останньої точки (100) — середина переходу опинилась би всередині
    // високої сусідки. Правильний підхід бере максимум по всьому ряду.
    const points = [
      { x: 50, y: 0, rowBottom: 120 },
      { x: 200, y: 0, rowBottom: 300 }, // найвища картка ряду — рахуємо саме її rowBottom
      { x: 350, y: 0, rowBottom: 100 },
      { x: 50, y: 400, rowBottom: 480 },
    ];
    const p = buildSnakePath(points, 10);
    // gapTop=300 (максимум ряду), gapBottom=400 -> midY=350, r=min(10,50,150)=10
    expect(p).toContain("L 350 340");
    expect(p).toContain("Q 350 350 340 350");
    expect(p).toContain("Q 50 350 50 360");
    expect(p).toContain("L 50 400");
  });

  it("три рядки — два переходи, кожен зі своїми заокругленнями", () => {
    const points = [
      { x: 50, y: 0, rowBottom: 80 },
      { x: 350, y: 0, rowBottom: 80 }, // рядок 1
      { x: 50, y: 200, rowBottom: 280 },
      { x: 350, y: 200, rowBottom: 280 }, // рядок 2
      { x: 50, y: 400, rowBottom: 480 }, // рядок 3
    ];
    const p = buildSnakePath(points, 10);
    const qCount = (p.match(/Q/g) || []).length;
    expect(qCount).toBe(4); // по 2 закруглення на кожен із 2 переходів
    expect(p.startsWith("M 50 0")).toBe(true);
    expect(p.endsWith("L 50 400")).toBe(true);
  });
});

describe("buildProgressPath", () => {
  const points = [
    { x: 50, y: 0, rowBottom: 80 },
    { x: 150, y: 0, rowBottom: 80 },
    { x: 250, y: 0, rowBottom: 80 },
    { x: 50, y: 200, rowBottom: 280 },
    { x: 150, y: 200, rowBottom: 280 },
  ];

  it("нічого не складено (stopIndex <= 0) — прогресу немає", () => {
    expect(buildProgressPath(points, 0)).toBe("");
    expect(buildProgressPath(points, -1)).toBe("");
  });

  it("стоп-точка десь усередині — шлях лише до неї включно", () => {
    const full = buildProgressPath(points, 2);
    expect(full).toBe(buildSnakePath(points.slice(0, 3)));
    expect(full.endsWith("L 250 0")).toBe(true);
  });

  it("стоп-точка на останньому модулі — увесь маршрут повністю зелений", () => {
    expect(buildProgressPath(points, points.length - 1)).toBe(buildSnakePath(points));
  });

  it("stopIndex за межами масиву не ламає функцію (slice сам обрізає)", () => {
    expect(() => buildProgressPath(points, 999)).not.toThrow();
  });
});
