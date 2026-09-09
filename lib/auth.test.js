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

const { requestLoginPin, confirmLoginPin } = await import("@/lib/auth");

const HOUR_MS = 60 * 60 * 1000;

describe("confirmLoginPin — термін дії PIN", () => {
  beforeEach(() => {
    employeeFindFirst.mockReset();
    employeeUpdate.mockReset();
  });

  it("невідомий externalCode -> not_found", async () => {
    employeeFindFirst.mockResolvedValue(null);
    const result = await confirmLoginPin("NOPE", "1234");
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("PIN, виданий щойно (0 хв тому) -> дійсний", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "1234",
      pinIssuedAt: new Date(),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
    });

    const result = await confirmLoginPin("RNE104", "1234");
    expect(result.ok).toBe(true);
  });

  it("PIN, виданий 59 хвилин тому -> ще дійсний (межа знизу)", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "1234",
      pinIssuedAt: new Date(Date.now() - (HOUR_MS - 60 * 1000)),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
    });

    const result = await confirmLoginPin("RNE104", "1234");
    expect(result.ok).toBe(true);
  });

  it("PIN, виданий рівно годину+1хв тому -> прострочений", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "1234",
      pinIssuedAt: new Date(Date.now() - (HOUR_MS + 60 * 1000)),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
    });

    const result = await confirmLoginPin("RNE104", "1234");
    expect(result).toEqual({ ok: false, error: "pin_expired" });
  });

  it("невірний PIN при дійсному терміні -> invalid_pin, не pin_expired", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "1234",
      pinIssuedAt: new Date(),
      firstLoginAt: new Date(),
      email: null,
      name: "Test",
    });

    const result = await confirmLoginPin("RNE104", "0000");
    expect(result).toEqual({ ok: false, error: "invalid_pin" });
  });

  it("співробітник без pinIssuedAt (ще жодного разу не запитував PIN) -> pin_expired, не падає", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "1234",
      pinIssuedAt: null,
      firstLoginAt: null,
      email: null,
      name: "Test",
    });

    const result = await confirmLoginPin("RNE104", "1234");
    expect(result).toEqual({ ok: false, error: "pin_expired" });
  });

  it("успішний вхід із email виводить ім'я з email, а не лишає введене раніше", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 1,
      loginPin: "1234",
      pinIssuedAt: new Date(),
      firstLoginAt: new Date(),
      email: "ivan.petrenko@carlsberg.ua",
      name: "Старе Імя",
    });
    employeeUpdate.mockResolvedValue({});

    const result = await confirmLoginPin("SV001", "1234");
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
    });

    await requestLoginPin("SV002");
    expect(sendLoginPin).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sv2@carlsberg.ua" })
    );
  });

  it("падіння sendLoginPin повертає ok:false, а не приховує помилку", async () => {
    employeeFindFirst.mockResolvedValue({
      id: 6,
      externalCode: "SV003",
      email: "sv3@carlsberg.ua",
      manager: null,
      name: "SV003 Test",
    });
    sendLoginPin.mockRejectedValue(new Error("Resend account in test mode"));

    const result = await requestLoginPin("SV003");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("email_send_failed");
  });
});
