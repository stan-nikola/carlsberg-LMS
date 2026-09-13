-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "department" TEXT;

-- Backfill: той самий mapping код->департамент, що вже застосований для
-- Employee.department (20260913172610_employee_department) — тут напряму
-- по Position.code, без join.
UPDATE "Position"
SET "department" = CASE "code"
  WHEN 'RM_HORECA'   THEN 'Продажі'
  WHEN 'ASM'         THEN 'Продажі'
  WHEN 'LKAM'        THEN 'Продажі'
  WHEN 'SV'          THEN 'Продажі'
  WHEN 'SV_RKA'      THEN 'Продажі'
  WHEN 'FSM_MT'      THEN 'Продажі'
  WHEN 'TECH_HORECA' THEN 'Продажі'
  WHEN 'SR'          THEN 'Продажі'
  WHEN 'SR_RKA'      THEN 'Продажі'
  WHEN 'MR_TT'       THEN 'Продажі'
  WHEN 'MR_RKA'      THEN 'Продажі'
  WHEN 'PR_HEAD'     THEN 'Виробництво'
  WHEN 'PR_STAFF'    THEN 'Виробництво'
  WHEN 'HR_HEAD'     THEN 'HR'
  WHEN 'HR_STAFF'    THEN 'HR'
  WHEN 'MK_HEAD'     THEN 'Маркетинг'
  WHEN 'MK_STAFF'    THEN 'Маркетинг'
  ELSE NULL
END;
