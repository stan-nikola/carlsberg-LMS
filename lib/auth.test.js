import { describe, it, expect, vi, beforeEach } from "vitest";

// requestLoginPin/confirmLoginPin ходять у prisma.employee.* і в
// sendLoginPin (Resend/Gmail) — обидва мокаємо, щоб перевіряти саму
// логіку (термін дії PIN, вибір отримувача, dev-оверрайд), не мережу й
// не БД.
const employeeFindFirst = vi.fn();
const employeeUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    employee: {
      findFirst: (...args) => employeeFindFirst(...args),
      update: (...args) => employeeUpdate(...args),
    },
  },
}));

const sendLoginPin = vi.fn();
vi.mock("@/lib/mailer", () => ({
  sendLoginPin: (...args) => sendLoginPin(...args),
}));

process.env.SESSION_SECRET ??= "test-secret-for-auth";
const { requestLoginPin, confirmLoginPin } = await import("@/lib/auth");
const { openPin, sealPin } = await import("@/lib/pinCrypto");

const TTL_MS = 12 * 60 * 60 * 1000; // lib/auth.js PIN_TTL_MS

describe("confirmLoginPin — термін дії PIN", () => {
  beforeEach(() => {
    employeeFindFirst.mockReset();
    employeeUpdate.mockReset();
  });

  it("невідомий externalCode -> not_found", async () => {
    employeeFindFirst.mockResolvedValue(null);
    const result = await confirmLoginPin("NOPE", "123456");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("PIN, виданий щойно (0 хв тому) -> дійсний", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "123456",
      pinIssuedAt: new Date(),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
      isActive: true,
    });

    const result = await confirmLoginPin("RNE104", "123456");
    expect(result.ok).toBe(true);
  });

  it("PIN, виданий 11 год 59 хв тому -> ще дійсний (межа знизу)", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "123456",
      pinIssuedAt: new Date(Date.now() - (TTL_MS - 60 * 1000)),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
      isActive: true,
    });

    const result = await confirmLoginPin("RNE104", "123456");
    expect(result.ok).toBe(true);
  });

  it("PIN, виданий рівно 12 год+1хв тому -> прострочений", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "123456",
      pinIssuedAt: new Date(Date.now() - (TTL_MS + 60 * 1000)),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
      isActive: true,
    });

    const result = await confirmLoginPin("RNE104", "123456");
    expect(result).toEqual({ ok: false, error: "pin_expired" });
  });

  it("деактивований співробітник з дійсним PIN -> deactivated, не pin_expired/ok:true", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "123456",
      pinIssuedAt: new Date(),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
      isActive: false,
    });

    const result = await confirmLoginPin("RNE104", "123456");
    expect(result).toEqual({ ok: false, error: "deactivated" });
  });

  it("невірний PIN при дійсному терміні -> invalid_pin, не pin_expired", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "123456",
      pinIssuedAt: new Date(),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
      isActive: true,
    });

    const result = await confirmLoginPin("RNE104", "000000");
    expect(result).toEqual({ ok: false, error: "invalid_pin" });
  });

  it("зашифрований у базі PIN приймається, чужий — ні", async () => {
    const row = { id: 1, loginPin: sealPin("482130"), pinIssuedAt: new Date(), firstLoginAt: new Date(), email: null, name: "RNE104 Test", isActive: true };
    employeeFindFirst.mockResolvedValue(row);
    expect((await confirmLoginPin("RNE104", "482130")).ok).toBe(true);
    employeeFindFirst.mockResolvedValue(row);
    expect(await confirmLoginPin("RNE104", "000000")).toEqual({ ok: false, error: "invalid_pin" });
  });

  it("старий 4-значний PIN (виданий до переходу на 6 цифр) ще приймається", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "1234",
      pinIssuedAt: new Date(),
      firstLoginAt: new Date(),
      email: null,
      name: "RNE104 Test",
      isActive: true,
    });

    const result = await confirmLoginPin("RNE104", "1234");
    expect(result.ok).toBe(true);
  });

  it("співробітник без pinIssuedAt (ще жодного разу не запитував PIN) -> pin_expired, не падає", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "123456",
      pinIssuedAt: null,
      firstLoginAt: null,
      email: null,
      name: "Test",
      isActive: true,
    });

    const result = await confirmLoginPin("RNE104", "123456");
    expect(result).toEqual({ ok: false, error: "pin_expired" });
  });

  it("успішний вхід із email виводить ім'я з email, а не лишає введене раніше", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "123456",
      pinIssuedAt: new Date(),
      firstLoginAt: new Date(),
      email: "ivan.petrenko@carlsberg.ua",
      name: "Старе Імя",
      isActive: true,
    });
    employeeUpdate.mockResolvedValue({});

    const result = await confirmLoginPin("SV001", "123456");
    expect(result.ok).toBe(true);
    expect(result.employee.name).toBe("Ivan Petrenko");
    expect(employeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Ivan Petrenko" }) })
    );
  });
});

describe("requestLoginPin — вибір отримувача", () => {
  beforeEach(() => {
    employeeFindFirst.mockReset();
    employeeUpdate.mockReset();
    sendLoginPin.mockReset();
    sendLoginPin.mockResolvedValue({});
    employeeUpdate.mockResolvedValue({});
    delete process.env.DEV_TEST_EMAIL_OVERRIDE;
  });

  it("невідомий код -> not_found, лист не відправляється", async () => {
    employeeFindFirst.mockResolvedValue(null);
    const result = await requestLoginPin("NOPE");
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(sendLoginPin).not.toHaveBeenCalled();
  });

  it("співробітник з особистою поштою (менеджерський шар) -> PIN іде йому самому", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      externalCode: "SV001",
      email: "sv@carlsberg.ua",
      manager: { email: "manager@carlsberg.ua" },
      name: "SV Test",
      isActive: true,
    });

    await requestLoginPin("SV001");
    expect(sendLoginPin).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sv@carlsberg.ua", isSelf: true })
    );
  });

  it("співробітник без особистої пошти (польова роль) -> PIN іде керівнику", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 2,
      externalCode: "TP001",
      email: null,
      manager: { email: "manager@carlsberg.ua" },
      name: "TP Test",
      isActive: true,
    });

    await requestLoginPin("TP001");
    expect(sendLoginPin).toHaveBeenCalledWith(
      expect.objectContaining({ to: "manager@carlsberg.ua", isSelf: false })
    );
  });

  it("немає ні особистої пошти, ні керівника -> no_manager_email, лист не шлеться", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 3,
      externalCode: "TP002",
      email: null,
      manager: null,
      name: "TP Orphan",
      isActive: true,
    });

    const result = await requestLoginPin("TP002");
    expect(result).toEqual({ ok: false, error: "no_manager_email" });
    expect(sendLoginPin).not.toHaveBeenCalled();
  });

  it("DEV_TEST_EMAIL_OVERRIDE підміняє отримувача лише для RNE104", async () => {
    process.env.DEV_TEST_EMAIL_OVERRIDE = "dev-tester@example.com";
    employeeFindFirst.mockResolvedValue({
      id: 4,
      externalCode: "RNE104",
      email: "real.employee@carlsberg.ua",
      manager: null,
      name: "RNE104 Test",
      isActive: true,
    });

    await requestLoginPin("RNE104");
    expect(sendLoginPin).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dev-tester@example.com" })
    );
  });

  it("DEV_TEST_EMAIL_OVERRIDE НЕ підміняє отримувача для будь-кого іншого", async () => {
    process.env.DEV_TEST_EMAIL_OVERRIDE = "dev-tester@example.com";
    employeeFindFirst.mockResolvedValue({
      id: 5,
      externalCode: "SV002",
      email: "sv2@carlsberg.ua",
      manager: null,
      name: "SV002 Test",
      isActive: true,
    });

    await requestLoginPin("SV002");
    expect(sendLoginPin).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sv2@carlsberg.ua" })
    );
  });

  it("код і введене ім'я йдуть у лист, Employee.name у листі лишається базовим", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 6,
      externalCode: "tp003", // навмисно нижній регістр — те саме, що ввела б людина
      email: null,
      manager: { email: "manager@carlsberg.ua" },
      name: "Торговий представник (ТП)",
      isActive: true,
    });

    await requestLoginPin("tp003", "Олена Коваль");
    expect(sendLoginPin).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeName: "Торговий представник (ТП)",
        externalCode: "tp003",
        enteredName: "Олена Коваль",
      })
    );
  });

  it("виданий PIN — рівно 6 цифр", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 8,
      externalCode: "TP005",
      email: null,
      manager: { email: "manager@carlsberg.ua" },
      name: "TP Test",
      isActive: true,
    });

    await requestLoginPin("TP005");
    const stored = employeeUpdate.mock.calls[0][0].data.loginPin;
    expect(stored).toMatch(/^e1:/); // у базі — лише шифротекст
    const sent = sendLoginPin.mock.calls[0][0].pin;
    expect(sent).toMatch(/^\d{6}$/);
    expect(openPin(stored)).toBe(sent);
  });

  it("повторний запит у вікні 10 хв надсилає той самий (зашифрований у базі) PIN і нічого не перезаписує", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 9,
      externalCode: "TP006",
      email: null,
      manager: { email: "manager@carlsberg.ua" },
      name: "TP Test",
      isActive: true,
      loginPin: sealPin("654321"),
      pinIssuedAt: new Date(),
    });

    await requestLoginPin("TP006");
    expect(sendLoginPin).toHaveBeenCalledWith(expect.objectContaining({ pin: "654321" }));
    expect(employeeUpdate).not.toHaveBeenCalled();
  });

  it("без введеного імені передає порожній рядок, а не undefined", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 7,
      externalCode: "TP004",
      email: null,
      manager: { email: "manager@carlsberg.ua" },
      name: "TP Test",
      isActive: true,
    });

    await requestLoginPin("TP004");
    expect(sendLoginPin).toHaveBeenCalledWith(expect.objectContaining({ enteredName: "" }));
  });

  it("падіння sendLoginPin повертає ok:false, а не приховує помилку", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 6,
      externalCode: "SV003",
      email: "sv3@carlsberg.ua",
      manager: null,
      name: "SV003 Test",
      isActive: true,
    });
    sendLoginPin.mockRejectedValue(new Error("Resend account in test mode"));

    const result = await requestLoginPin("SV003");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("email_send_failed");
  });

  it("деактивований співробітник -> deactivated, лист не шлеться (PIN взагалі не видається)", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 7,
      externalCode: "SV004",
      email: "sv4@carlsberg.ua",
      manager: null,
      name: "SV004 Test",
      isActive: false,
    });

    const result = await requestLoginPin("SV004");
    expect(result).toEqual({ ok: false, error: "deactivated" });
    expect(sendLoginPin).not.toHaveBeenCalled();
    expect(employeeUpdate).not.toHaveBeenCalled();
  });
});
