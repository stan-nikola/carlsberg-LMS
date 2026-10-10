import { describe, expect, it, vi } from "vitest";

const employeeFindMany = vi.fn();
const createManyAndReturn = vi.fn();
const sendPush = vi.fn(async (..._a: unknown[]) => ({ sent: 2 }));
const sendTelegram = vi.fn(async (..._a: unknown[]) => ({ sent: 2 }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    employee: { findMany: (...a: unknown[]) => employeeFindMany(...a) },
    notificationPreference: { findMany: async () => [] },
    notification: { createManyAndReturn: (...a: unknown[]) => createManyAndReturn(...a) },
    pushSubscription: {
      findMany: async () => [
        { id: 1, employeeId: 1, endpoint: "e1", p256dh: "p", auth: "a" },
        { id: 2, employeeId: 2, endpoint: "e2", p256dh: "p", auth: "a" },
      ],
    },
    telegramLink: {
      findMany: async () => [
        { employeeId: 1, chatId: "c1" },
        { employeeId: 2, chatId: "c2" },
      ],
    },
  },
}));
vi.mock("@/lib/webPush", () => ({ sendPushToSubscriptions: (...a: unknown[]) => sendPush(...a) }));
vi.mock("@/lib/telegram", () => ({ sendTelegramToLinks: (...a: unknown[]) => sendTelegram(...a) }));

const { notifyEmployees } = await import("./notifications");

describe("notifyEmployees — push і Telegram ведуть на запис у дзвінку", () => {
  it("кожному — адреса його запису в центрі свого кабінету, а не event.url", async () => {
    // 1 — польова роль (level 5), 2 — керівник (level 3).
    employeeFindMany.mockResolvedValue([
      { id: 1, position: { level: 5 } },
      { id: 2, position: { level: 3 } },
    ]);
    createManyAndReturn.mockResolvedValue([
      { id: 501, employeeId: 1 },
      { id: 502, employeeId: 2 },
    ]);

    await notifyEmployees([1, 2], { type: "course_assigned", title: "Новий курс", message: "Вам призначено курс", url: "/courses/pyvo" });

    const urlForPush = sendPush.mock.calls[0][2] as (id: number) => string;
    const urlForTelegram = sendTelegram.mock.calls[0][2] as (id: number) => string;
    for (const urlFor of [urlForPush, urlForTelegram]) {
      expect(urlFor(1)).toBe("/hub/notifications?highlight=501");
      expect(urlFor(2)).toBe("/manager/notifications?highlight=502");
    }
    expect(sendPush.mock.calls[0][1]).not.toHaveProperty("url");
    expect(sendTelegram.mock.calls[0][1]).not.toHaveProperty("url");
  });
});
