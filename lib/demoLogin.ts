import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { isManagerTier } from "@/lib/permissions";

/**
 * «Тестовий вхід» на екрані реєстрації — для показу платформи колегам:
 * людина обирає кабінет (польовий співробітник / керівник) і одну з
 * демо-персон, вказує СВОЮ пошту, і PIN іде на неї, а не на пошту
 * співробітника/керівника з бази. Нічого в базі не змінюється.
 *
 * Увімкнено лише коли задано DEMO_LOGIN_CODES (кома-список кодів
 * співробітників, напр. MR0106,SR0106,SV0036): без змінної кнопки нема,
 * а API відкидає demoEmail. Список — свідомо у змінній оточення, а не в
 * коді: на проді його можна вимкнути або звузити без деплою.
 */
const prisma = prismaUntyped as PrismaClient;

export function demoLoginCodes(): string[] {
  return (process.env.DEMO_LOGIN_CODES || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function isDemoLoginEnabled(): boolean {
  return demoLoginCodes().length > 0;
}

export function isDemoCode(externalCode: string): boolean {
  return demoLoginCodes().includes(externalCode.trim().toUpperCase());
}

export type DemoLoginOption = {
  code: string;
  name: string;
  position: string;
  cabinet: "manager" | "employee";
};

export async function getDemoLoginOptions(): Promise<{ enabled: boolean; options: DemoLoginOption[] }> {
  const codes = demoLoginCodes();
  if (codes.length === 0) return { enabled: false, options: [] };
  const rows = await prisma.employee.findMany({
    where: { externalCode: { in: codes, mode: "insensitive" }, isActive: true },
    select: { externalCode: true, name: true, position: { select: { name: true, level: true } } },
  });
  const order = new Map(codes.map((c, i) => [c, i]));
  const options: DemoLoginOption[] = rows
    .map((r) => ({
      code: r.externalCode,
      name: r.name,
      position: r.position?.name ?? "",
      cabinet: isManagerTier(r) ? ("manager" as const) : ("employee" as const),
    }))
    .sort((a, b) => (order.get(a.code.toUpperCase()) ?? 0) - (order.get(b.code.toUpperCase()) ?? 0));
  return { enabled: true, options };
}
