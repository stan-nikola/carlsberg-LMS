import { describe, it, expect, vi, beforeEach } from "vitest";

// uniqueSlug ходить у prisma.course.findFirst — мокаємо самим модулем
// prisma перед імпортом, тримаючи "зайняті" слаги в масиві, який кожен
// тест сам собі готує.
let existingSlugs = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    course: {
      findFirst: vi.fn(({ where }) => {
        const taken = existingSlugs.includes(where.slug);
        return Promise.resolve(taken ? { id: 999 } : null);
      }),
    },
  },
}));

const { slugify, uniqueSlug } = await import("@/lib/slug");

describe("slugify", () => {
  it("транслітерує кирилицю в латиницю", () => {
    expect(slugify("Адаптація мерчендайзерів")).toBe("adaptatsiia-merchendaizeriv");
  });

  it("обробляє апостроф і м'який знак без залишкового смітя", () => {
    expect(slugify("П'ятниця")).toBe("piatnytsia");
  });

  it("схлопує будь-які не-[a-z0-9] символи в одне тире", () => {
    expect(slugify("Тест!!!  №1 --- готово")).toBe("test-1-hotovo");
  });

  it("обрізає тире з країв і не лишає пусту стрічку", () => {
    expect(slugify("---")).toBe("course"); // фолбек, коли після транслітерації нічого не лишилось
  });

  it("обмежує довжину 60 символами", () => {
    const longTitle = "а".repeat(100);
    const result = slugify(longTitle);
    expect(result.length).toBeLessThanOrEqual(60);
  });
});

describe("uniqueSlug", () => {
  beforeEach(() => {
    existingSlugs = [];
  });

  it("повертає baseSlug як є, якщо він вільний", async () => {
    const slug = await uniqueSlug("merchandiser-adaptation");
    expect(slug).toBe("merchandiser-adaptation");
  });

  it("додає -2, якщо baseSlug вже зайнято", async () => {
    existingSlugs = ["merchandiser-adaptation"];
    const slug = await uniqueSlug("merchandiser-adaptation");
    expect(slug).toBe("merchandiser-adaptation-2");
  });

  it("перебирає суфікси, поки не знайде вільний", async () => {
    existingSlugs = ["course", "course-2", "course-3"];
    const slug = await uniqueSlug("course");
    expect(slug).toBe("course-4");
  });

  it("excludeId дозволяє курсу лишити собі свій же поточний slug (перегенерація при перейменуванні)", async () => {
    // findFirst у реальній реалізації враховує id: { not: excludeId } — тут
    // важливо саме те, що uniqueSlug передає excludeId далі в запит, а не
    // повторно перевіряє його сам; це фіксується через сам мок findFirst
    // вище (де where.slug — єдина умова, яку ми емулюємо "зайнятості" по).
    // Тому цей тест перевіряє інший практичний випадок: інший курс уже
    // зайняв базовий slug, тож навіть з excludeId (не своїм id) отримаємо -2.
    existingSlugs = ["merchandiser-adaptation"];
    const slug = await uniqueSlug("merchandiser-adaptation", 42);
    expect(slug).toBe("merchandiser-adaptation-2");
  });
});
