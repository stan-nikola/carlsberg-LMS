import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated, isSuperAdmin } from "@/lib/adminSession";

/**
 * externalCode фіктивного Employee «Система/Адміністратор» (заводиться в
 * prisma/seed.js). /admin — окремий вхід за паролем без «свого» Employee, тож
 * там, де схема вимагає реального автора (Enrollment.assignedById,
 * EmployeeBadge.awardedById), пишемо від нього.
 */
export const SYSTEM_ADMIN_EXTERNAL_CODE = "SYSTEM-ADMIN";

/** true, якщо в запиту є дійсна admin_session (будь-якого рівня). */
export async function requireAdmin(): Promise<boolean> {
  return isAdminAuthenticated();
}

/**
 * Перевірка доступу на початку /admin-роуту:
 *   const denied = await adminGuard();      // або adminGuard("super")
 *   if (denied) return denied;
 * null — можна далі; інакше готова відповідь 403.
 */
export async function adminGuard(level: "admin" | "super" = "admin"): Promise<Response | null> {
  const ok = level === "super" ? await isSuperAdmin() : await isAdminAuthenticated();
  return ok ? null : Response.json({ error: "Forbidden" }, { status: 403 });
}

/** id системного Employee для дій з /admin; null — seed не запускали. */
export async function getSystemAdminId(): Promise<number | null> {
  const row = await prisma.employee.findFirst({ where: { externalCode: SYSTEM_ADMIN_EXTERNAL_CODE }, select: { id: true } });
  return row?.id ?? null;
}
