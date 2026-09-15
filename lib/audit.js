import { prisma } from "@/lib/prisma";

/**
 * Запис у журнал дій адміна (AuditLog). Best-effort: помилка запису
 * ніколи не ламає саму дію — журнал вторинний до бізнес-операції.
 *
 * action — "<сутність>.<дія>", напр. enrollment.update, badge.award,
 * course.assign, rating.rules.update. Підписи для UI — components/AdminAudit.jsx.
 */
export async function audit(action, targetType, targetId, details) {
  try {
    await prisma.auditLog.create({
      data: { action, targetType, targetId: targetId == null ? null : Number(targetId), details: details ?? undefined },
    });
  } catch (err) {
    console.warn("[audit]", action, err?.message);
  }
}
