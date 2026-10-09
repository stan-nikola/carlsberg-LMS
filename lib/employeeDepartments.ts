/**
 * Допустимі департаменти — і для Employee.department, і для Course.category
 * (у конструкторі «Департамент»). Звичайний String у схемі, не enum: новий
 * департамент — рядок тут, без міграції.
 */
export const EMPLOYEE_DEPARTMENTS = ["Продажі", "Виробництво", "HR", "Маркетинг"] as const;
