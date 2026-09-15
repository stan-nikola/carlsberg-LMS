import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueue, flushOutbox, outboxSize } from "@/lib/offlineOutbox";

// localStorage + fetch — заглушки; перевіряємо порядок і поведінку на збоях.
const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
  };
});

describe("offlineOutbox", () => {
  it("шле по порядку; мережевий збій зупиняє і лишає хвіст; 4xx викидається", async () => {
    enqueue("/a", { n: 1 });
    enqueue("/b", { n: 2 });
    enqueue("/c", { n: 3 });
    expect(outboxSize()).toBe(3);

    const calls = [];
    globalThis.fetch = vi.fn(async (url) => {
      calls.push(url);
      if (url === "/b") throw new TypeError("Failed to fetch");
      return { ok: true, status: 200 };
    });
    expect(await flushOutbox()).toBe(1);
    expect(calls).toEqual(["/a", "/b"]);
    expect(outboxSize()).toBe(2);

    globalThis.fetch = vi.fn(async (url) => ({ ok: url !== "/b", status: url === "/b" ? 404 : 200 }));
    expect(await flushOutbox()).toBe(2);
    expect(outboxSize()).toBe(0);
  });
});
