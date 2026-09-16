import { describe, it, expect } from "vitest";
import { signLinkToken, verifyLinkToken, parseCommand, formatTelegramMessage, absoluteUrl, deepLink } from "@/lib/telegramLogic";

const SECRET = "test-secret";

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
