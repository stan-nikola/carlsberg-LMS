import { describe, expect, it } from "vitest";
import { courseFieldsFromBody } from "./courseFields";

describe("courseFieldsFromBody", () => {
  it("лише ті поля, що прийшли (PATCH не затирає решту)", () => {
    expect(courseFieldsFromBody({ title: "Курс" })).toEqual({ title: "Курс" });
  });
  it("числа з форми: рядок → число, порожньо → null, поріг за замовчуванням 80", () => {
    expect(courseFieldsFromBody({ deadlineDays: "21", moduleDays: "", points: null, passThreshold: "" })).toEqual({
      deadlineDays: 21,
      moduleDays: null,
      points: null,
      passThreshold: 80,
    });
  });
  it("прапорці, прев'ю, цілі й дата публікації", () => {
    const out = courseFieldsFromBody({ isMandatory: 1, previewDevice: "tablet", targetPositions: null, publishAt: "", folderId: "3" });
    expect(out).toEqual({ isMandatory: true, previewDevice: "phone", targetPositions: [], publishAt: null, folderId: 3 });
  });
});
