-- Курс -> Блок -> Модуль -> Екран: додаємо Block між Course і Module.
-- Одночасно переносимо наявний вміст курсу "assortment" (5 модулів, 0
-- enrollments — перевірено перед міграцією) у Блок 1 нового курсу
-- "Адаптація мерчендайзерів" і видаляємо порожній старий курс. Ручна
-- (не згенерована `prisma migrate dev`, той не вміє data-міграції) —
-- `prisma migrate dev` в неінтерактивному середовищі відмовляється
-- виконати цей крок автоматично (required column без default на
-- непорожній таблиці).

-- 1. Нова таблиця Block
CREATE TABLE "Block" (
    "id" SERIAL NOT NULL,
    "courseId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- 2. Module отримує blockId (поки nullable — заповнюємо нижче)
ALTER TABLE "Module" ADD COLUMN "blockId" INTEGER;

-- 3. Дані: новий курс + Блок 1 "Асортимент", наявні Module переносяться
DO $$
DECLARE
  new_course_id INTEGER;
  new_block_id INTEGER;
BEGIN
  INSERT INTO "Course" ("slug", "title", "description", "isMandatory", "targetPositions", "targetTerritories", "createdAt", "updatedAt")
  VALUES (
    'merchandiser-adaptation',
    'Адаптація мерчендайзерів',
    NULL,
    false,
    ARRAY[]::TEXT[],
    ARRAY[]::INTEGER[],
    NOW(),
    NOW()
  )
  RETURNING "id" INTO new_course_id;

  INSERT INTO "Block" ("courseId", "title", "order")
  VALUES (new_course_id, 'Асортимент', 1)
  RETURNING "id" INTO new_block_id;

  UPDATE "Module"
  SET "blockId" = new_block_id
  WHERE "courseId" = (SELECT "id" FROM "Course" WHERE "slug" = 'assortment');
END $$;

-- 4. blockId стає обов'язковим + FK; courseId (стара колонка) прибираємо
ALTER TABLE "Module" ALTER COLUMN "blockId" SET NOT NULL;
ALTER TABLE "Module" DROP CONSTRAINT IF EXISTS "Module_courseId_fkey";
ALTER TABLE "Module" DROP COLUMN "courseId";
ALTER TABLE "Module" ADD CONSTRAINT "Module_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Block -> Course FK
ALTER TABLE "Block" ADD CONSTRAINT "Block_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Старий курс "assortment" тепер порожній — весь реальний вміст живе
-- в новому курсі "merchandiser-adaptation".
DELETE FROM "Course" WHERE "slug" = 'assortment';
