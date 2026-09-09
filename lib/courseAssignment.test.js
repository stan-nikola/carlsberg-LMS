import { describe, it, expect, vi, beforeEach } from "vitest";

// Головний контракт, який тут важливо зафіксувати тестом: Course.targetPositions/
// targetTerritories/publishAt самі по собі НІКОЛИ не створюють Enrollment —
// саме відсутність цього факту вже раз призвела до реального бага
// ("призначив курс — співробітник його не побачив", виправлено додаванням
// кнопки "Призначити зараз"). Тест на publishScheduledCourses нижче фіксує,
// що auto-призначення спрацьовує лише коли є ЯВНИЙ publishAt у минулому.
const courseFindMany = vi.fn();
const courseFindUniqueOrThrow = vi.fn();
const courseUpdate = vi.fn();
const employeeFindMany = vi.fn();
const employeeFindFirst = vi.fn();
const enrollmentCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    course: {
      findMany: (...args) => courseFindMany(...args),
      findUniqueOrThrow: (...args) => courseFindUniqueOrThrow(...args),
      update: (...args) => courseUpdate(...args),
    },
    employee: {
      findMany: (...args) => employeeFindMany(...args),
      findFirst: (...args) => employeeFindFirst(...args),
    },
    enrollment: {
      createMany: (...args) => enrollmentCreateMany(...args),
    },
  },
}));

vi.mock("@/lib/adminAuth", () => ({ SYSTEM_ADMIN_EXTERNAL_CODE: "SYSTEM-ADMIN" }));

const { assignCourseToPositionsAndTerritories, publishScheduledCourses } = await import(
  "@/lib/courseAssignment"
);

describe("assignCourseToPositionsAndTerritories", () => {
  beforeEach(() => {
    courseFindUniqueOrThrow.mockReset();
    employeeFindMany.mockReset();
    enrollmentCreateMany.mockReset();
  });

  it("кидає помилку, коли порожні і positionCodes, і employeeIds — нема кого шукати", async () => {
    await expect(
      assignCourseToPositionsAndTerritories(1, { positionCodes: [], assignedByUserId: 1 })
    ).rejects.toThrow("Provide positionCodes and/or employeeIds");
    expect(employeeFindMany).not.toHaveBeenCalled();
  });

  it("employeeIds без positionCodes — точкове призначення конкретним людям, без пошуку по посаді", async () => {
    courseFindUniqueOrThrow.mockResolvedValue({ id: 1, deadlineDays: null, isMandatory: true });
    enrollmentCreateMany.mockResolvedValue({ count: 2 });

    await assignCourseToPositionsAndTerritories(1, { employeeIds: [42, 43], assignedByUserId: 999 });

    expect(employeeFindMany).not.toHaveBeenCalled();
    const ids = enrollmentCreateMany.mock.calls[0][0].data.map((d) => d.employeeId);
    expect(ids.sort()).toEqual([42, 43]);
  });

  it("employeeIds об'єднується з результатом пошуку по positionCodes, без дублів", async () => {
    courseFindUniqueOrThrow.mockResolvedValue({ id: 1, deadlineDays: null, isMandatory: true });
    employeeFindMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    enrollmentCreateMany.mockResolvedValue({ count: 3 });

    await assignCourseToPositionsAndTerritories(1, {
      positionCodes: ["SV"],
      employeeIds: [11, 99], // 11 уже є серед знайдених по посаді — не має задублюватись
      assignedByUserId: 999,
    });

    const ids = enrollmentCreateMany.mock.calls[0][0].data.map((d) => d.employeeId);
    expect(ids.sort((a, b) => a - b)).toEqual([10, 11, 99]);
  });

  it("без territoryIds призначає всім співробітникам заданих посад незалежно від території", async () => {
    courseFindUniqueOrThrow.mockResolvedValue({ id: 1, deadlineDays: null, isMandatory: true });
    employeeFindMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    enrollmentCreateMany.mockResolvedValue({ count: 2 });

    await assignCourseToPositionsAndTerritories(1, {
      positionCodes: ["SV"],
      assignedByUserId: 999,
    });

    const whereArg = employeeFindMany.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("territoryId");
  });

  it("з непорожнім territoryIds фільтрує співробітників по територіях", async () => {
    courseFindUniqueOrThrow.mockResolvedValue({ id: 1, deadlineDays: null, isMandatory: true });
    employeeFindMany.mockResolvedValue([{ id: 10 }]);
    enrollmentCreateMany.mockResolvedValue({ count: 1 });

    await assignCourseToPositionsAndTerritories(1, {
      positionCodes: ["SV"],
      territoryIds: [5, 6],
      assignedByUserId: 999,
    });

    const whereArg = employeeFindMany.mock.calls[0][0].where;
    expect(whereArg.territoryId).toEqual({ in: [5, 6] });
  });

  it("рахує dueDate від deadlineDays курсу, а не залишає null коли він заданий", async () => {
    courseFindUniqueOrThrow.mockResolvedValue({ id: 1, deadlineDays: 14, isMandatory: false });
    employeeFindMany.mockResolvedValue([{ id: 10 }]);
    enrollmentCreateMany.mockResolvedValue({ count: 1 });

    await assignCourseToPositionsAndTerritories(1, {
      positionCodes: ["SV"],
      assignedByUserId: 999,
    });

    const createData = enrollmentCreateMany.mock.calls[0][0].data[0];
    expect(createData.dueDate).toBeInstanceOf(Date);
    expect(createData.isMandatory).toBe(false);
  });

  it("порожній список співробітників не викликає enrollment.createMany", async () => {
    courseFindUniqueOrThrow.mockResolvedValue({ id: 1, deadlineDays: null, isMandatory: true });
    employeeFindMany.mockResolvedValue([]);

    const result = await assignCourseToPositionsAndTerritories(1, {
      positionCodes: ["SV"],
      assignedByUserId: 999,
    });

    expect(enrollmentCreateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ assignedCount: 0, skippedCount: 0 });
  });
});

describe("publishScheduledCourses — targetPositions/publishAt самі по собі нічого не призначають", () => {
  beforeEach(() => {
    courseFindMany.mockReset();
    courseFindUniqueOrThrow.mockReset();
    courseUpdate.mockReset();
    employeeFindMany.mockReset();
    employeeFindFirst.mockReset();
    enrollmentCreateMany.mockReset();
  });

  it("курс без due publishAt (запит фільтрує lte:now) не потрапляє в обробку — findMany викликається з правильними умовами", async () => {
    courseFindMany.mockResolvedValue([]);

    const result = await publishScheduledCourses();

    const whereArg = courseFindMany.mock.calls[0][0].where;
    expect(whereArg.autoAssignedAt).toEqual(null);
    // Курс публікується, якщо задано ХОЧ ОДНЕ з двох: посади АБО конкретні
    // employeeIds (точкове призначення без жодної посади теж має спрацювати).
    expect(whereArg.OR).toEqual([{ targetPositions: { isEmpty: false } }, { targetEmployeeIds: { isEmpty: false } }]);
    expect(result).toEqual({ publishedCount: 0, assignedCount: 0 });
    expect(employeeFindFirst).not.toHaveBeenCalled(); // навіть системного адміна не шукає, якщо нема що публікувати
  });

  it("для due-курсу викликає призначення від SYSTEM-ADMIN і позначає autoAssignedAt", async () => {
    const dueCourse = {
      id: 1,
      targetPositions: ["SV"],
      targetTerritories: [],
      deadlineDays: null,
      isMandatory: true,
    };
    courseFindMany.mockResolvedValue([dueCourse]);
    employeeFindFirst.mockResolvedValue({ id: 777, externalCode: "SYSTEM-ADMIN" });
    courseFindUniqueOrThrow.mockResolvedValue(dueCourse);
    employeeFindMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    enrollmentCreateMany.mockResolvedValue({ count: 2 });
    courseUpdate.mockResolvedValue({});

    const result = await publishScheduledCourses();

    expect(result).toEqual({ publishedCount: 1, assignedCount: 2 });
    // Реальне призначення пішло саме від системного актора, не від "нікого"
    expect(enrollmentCreateMany.mock.calls[0][0].data[0].assignedById).toBe(777);
    expect(courseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ autoAssignedAt: expect.any(Date) }) })
    );
  });

  it("кидає явну помилку, якщо системний адмін не засіяний, замість тихого no-op", async () => {
    courseFindMany.mockResolvedValue([
      { id: 1, targetPositions: ["SV"], targetTerritories: [], deadlineDays: null, isMandatory: true },
    ]);
    employeeFindFirst.mockResolvedValue(null);

    await expect(publishScheduledCourses()).rejects.toThrow("System admin employee not found");
  });
});
