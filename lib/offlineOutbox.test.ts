import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueue, flushOutbox, outboxSize } from "@/lib/offlineOutbox";

// localStorage + fetch — заглушки; перевіряємо порядок і поведінку на збоях.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
  } as unknown as Storage;
});

const ok = (status = 200) => ({ ok: status < 300, status }) as Response;

describe("offlineOutbox", () => {
  it("шле по порядку; мережевий збій зупиняє і лишає хвіст; 4xx викидається", async () => {
    enqueue("/a", { n: 1 });
    enqueue("/b", { n: 2 });
    enqueue("/c", { n: 3 });
    expect(outboxSize()).toBe(3);

    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === "/b") throw new TypeError("Failed to fetch");
      return ok();
    }) as unknown as typeof fetch;
    expect(await flushOutbox()).toBe(1);
    expect(calls).toEqual(["/a", "/b"]);
    expect(outboxSize()).toBe(2);

    globalThis.fetch = vi.fn(async (url: string) => ok(url === "/b" ? 404 : 200)) as unknown as typeof fetch;
    expect(await flushOutbox()).toBe(1);
    expect(outboxSize()).toBe(0);
  });

  it("запис, доданий під час відправки, не губиться", async () => {
    enqueue("/a", { n: 1 });
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url === "/a") enqueue("/late", { n: 2 });
      return ok();
    }) as unknown as typeof fetch;
    expect(await flushOutbox()).toBe(2);
    expect(outboxSize()).toBe(0);
  });

  it("401 (сесія скінчилась) лишає результат у черзі", async () => {
    enqueue("/a", { n: 1 });
    globalThis.fetch = vi.fn(async () => ok(401)) as unknown as typeof fetch;
    expect(await flushOutbox()).toBe(0);
    expect(outboxSize()).toBe(1);
  });
});
