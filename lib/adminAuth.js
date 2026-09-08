import { isAdminAuthenticated } from "@/lib/adminSession";

/**
 * externalCode фиктивного Employee "Система/Адміністратор" — заводится
 * один раз через prisma/seed.js. /admin теперь вход по общему паролю
 * (ADMIN_PASSWORD, см. lib/adminSession.js), полностью отдельно от
 * employee PIN-логина, поэтому у запроса из /admin нет "своего" Employee.
 * Там, где схема требует реального Employee (например
 * Enrollment.assignedById — см. app/api/admin/courses/[courseId]/assign/route.js),
 * пишем этого системного — держите строку синхронной с prisma/seed.js.
 */
export const SYSTEM_ADMIN_EXTERNAL_CODE = "SYSTEM-ADMIN";

/**
 * true, если у запроса валидная /admin-сессия — вызывающий код отвечает
 * за 403. Раньше проверяла employee.role (admin/hr_manager) через обычную
 * cookie-сессию; теперь /admin — отдельный вход по паролю, роль Employee
 * тут ни при чём (см. git-историю, если нужен старый вариант).
 */
export async function requireAdmin() {
  return isAdminAuthenticated();
}
