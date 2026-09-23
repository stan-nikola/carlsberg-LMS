import { describe, expect, it } from "vitest";
import { isVideoUrl, parseVideoEmbed } from "./videoEmbed";

const ID = "tB0KssXel0c";

describe("parseVideoEmbed", () => {
  it("розпізнає всі форми посилання YouTube", () => {
    const forms = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s`,
      `youtube.com/watch?v=${ID}`, // скопійоване без протоколу
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      ID, // просто ідентифікатор
    ];
    for (const form of forms) {
      expect(parseVideoEmbed(form), form).toMatchObject({ provider: "youtube", id: ID });
    }
    expect(parseVideoEmbed(forms[0])?.src).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0`);
  });

  it("розпізнає Vimeo — і сторінку, і плеєр", () => {
    expect(parseVideoEmbed("https://vimeo.com/76979871")).toMatchObject({ provider: "vimeo", id: "76979871" });
    expect(parseVideoEmbed("https://player.vimeo.com/video/76979871")?.src).toBe("https://player.vimeo.com/video/76979871");
  });

  it("не приймає фото, порожнечу і чужі сервіси", () => {
    // Шлях до фото не має раптом ставати відео — одне й те саме поле в
    // конструкторі приймає і те, і те.
    expect(parseVideoEmbed("/assets/photo.jpg")).toBeNull();
    expect(parseVideoEmbed("https://khkksob5konmwp9o.public.blob.vercel-storage.com/a.jpg")).toBeNull();
    expect(parseVideoEmbed("")).toBeNull();
    expect(parseVideoEmbed("   ")).toBeNull();
    expect(parseVideoEmbed("https://vimeo.com/channels/staffpicks")).toBeNull();
    expect(parseVideoEmbed("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(isVideoUrl("https://tiktok.com/@user/video/123")).toBe(false);
  });
});
