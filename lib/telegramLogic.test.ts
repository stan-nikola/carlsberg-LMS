import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  signLinkToken,
  verifyLinkToken,
  parseCommand,
  formatTelegramMessage,
  absoluteUrl,
  deepLink,
  verifyInitData,
} from "@/lib/telegramLogic";

const SECRET = "test-secret";
const BOT_TOKEN = "123:ABC-test-token";

/** Будує initData так само, як це робить сам Telegram, — щоб тест перевіряв
 *  саме сумісність із реальним алгоритмом, а не узгодженість самої з собою. */
function makeInitData(fields: Record<string, string>, botToken = BOT_TOKEN) {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe("link token", () => {
  it("підписує і перевіряє", () => {
    const t = signLinkToken(326, SECRET, 1_000_000);
    expect(t).toMatch(/^326_\d+_[0-9a-f]{20}$/);
    expect(t.length).toBeLessThanOrEqual(64);
    expect(verifyLinkToken(t, SECRET, 1_000_000)).toBe(326);
  });
  it("відкидає прострочений, чужий підпис і сміття", () => {
    const t = signLinkToken(326, SECRET, 1_000_000);
    expect(verifyLinkToken(t, SECRET, 1_000_000 + 16 * 60 * 1000)).toBeNull();
    expect(verifyLinkToken(t, "other", 1_000_000)).toBeNull();
    expect(verifyLinkToken(t.replace(/_\d+_/, "_999_"), SECRET, 1_000_000)).toBeNull();
    expect(verifyLinkToken("", SECRET)).toBeNull();
    expect(verifyLinkToken("326_1_zz", SECRET)).toBeNull();
    expect(verifyLinkToken(null, SECRET)).toBeNull();
  });
});

describe("parseCommand", () => {
  it("start з токеном, у т.ч. з @bot", () => {
    expect(parseCommand("/start abc_1_2")).toEqual({ cmd: "start", arg: "abc_1_2" });
    expect(parseCommand("/start@CarlsON_bot abc")).toEqual({ cmd: "start", arg: "abc" });
    expect(parseCommand("/start")).toEqual({ cmd: "start", arg: "" });
  });
  it("stop/help і звичайний текст", () => {
    expect(parseCommand("/stop")).toEqual({ cmd: "stop" });
    expect(parseCommand("/help")).toEqual({ cmd: "help" });
    expect(parseCommand("привіт")).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
  });
});

describe("format", () => {
  it("екранує HTML і ставить заголовок жирним", () => {
    expect(formatTelegramMessage({ title: "A <b>", message: "x & y" })).toBe("<b>A &lt;b&gt;</b>\nx &amp; y");
    expect(formatTelegramMessage({ message: "m" })).toBe("m");
  });
  it("absoluteUrl", () => {
    expect(absoluteUrl("https://a.b/", "/hub")).toBe("https://a.b/hub");
    expect(absoluteUrl(null, "/hub")).toBeNull();
    expect(absoluteUrl(null, "https://x.y/z")).toBe("https://x.y/z");
    expect(absoluteUrl("https://a.b", null)).toBeNull();
  });
  it("deepLink", () => {
    expect(deepLink("CarlsON_bot", "1_2_3")).toBe("https://t.me/CarlsON_bot?start=1_2_3");
  });
});

describe("verifyInitData", () => {
  const NOW = 1_700_000_000_000;
  const fields = { auth_date: String(Math.floor(NOW / 1000) - 10), query_id: "AA", user: JSON.stringify({ id: 326, first_name: "Роман" }) };

  it("приймає справжній підпис Telegram", () => {
    const initData = makeInitData(fields);
    const r = verifyInitData(initData, BOT_TOKEN, 86400, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user).toEqual({ id: 326, first_name: "Роман" });
  });

  it("відкидає підроблений hash, чужий bot token і зіпсовані поля", () => {
    const initData = makeInitData(fields);
    expect(verifyInitData(initData, "other-token", 86400, NOW).ok).toBe(false);
    expect(verifyInitData(initData.replace(/user=[^&]+/, "user=%7B%22id%22%3A999%7D"), BOT_TOKEN, 86400, NOW).ok).toBe(false);
    expect(verifyInitData(initData.slice(0, -2), BOT_TOKEN, 86400, NOW).ok).toBe(false);
    expect(verifyInitData("", BOT_TOKEN, 86400, NOW).ok).toBe(false);
    expect(verifyInitData(initData, undefined, 86400, NOW).ok).toBe(false);
  });

  it("відкидає прострочений auth_date", () => {
    const stale = makeInitData({ ...fields, auth_date: String(Math.floor((NOW - 2 * 86400_000) / 1000)) });
    expect(verifyInitData(stale, BOT_TOKEN, 86400, NOW).ok).toBe(false);
  });

  it("відкидає, коли немає user", () => {
    const noUser = makeInitData({ auth_date: fields.auth_date, query_id: "AA" });
    expect(verifyInitData(noUser, BOT_TOKEN, 86400, NOW).ok).toBe(false);
  });
});
