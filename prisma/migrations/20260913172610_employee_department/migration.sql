-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "department" TEXT;

-- Backfill: department виводиться з Position.code того самого рядка
-- (не вигадка — на момент цієї міграції КОЖЕН реальний співробітник у
-- продакшн-БД належить до збутової гілки, тож усі отримують "Продажі";
-- синтетична demo-БД додатково має PR_*/HR_*/MK_* коди для трьох нових
-- департаментів). Рядки без positionId (наразі таких немає) лишаються
-- NULL — значення для них не з чого вивести, тому не вгадується.
UPDATE "Employee" e
SET "department" = CASE p."code"
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
END
FROM "Position" p
WHERE e."positionId" = p.id;
