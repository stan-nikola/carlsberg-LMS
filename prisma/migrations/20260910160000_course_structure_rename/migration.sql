-- Course structure rename: Block->Module, Module->Screen, Lesson->Component,
-- BlockCompletion->ModuleCompletion, LessonType->ComponentType (+photo/input).
-- Hand-written (not `prisma migrate dev`, який в неінтерактивному середовищі
-- бачить це як DROP+CREATE на непорожніх таблицях і відмовляється) — усі
-- нижченаведені кроки суто перейменування: жоден рядок не рухається, жоден
-- id/FK не змінюється, дані Block(4)/BlockCompletion(2)/Lesson(13)/Module(2)
-- лишаються рівно тими самими рядками під новими іменами таблиць/колонок.

-- ===== 1. Перейменування enum LessonType -> ComponentType (+ нові значення) =====
ALTER TYPE "LessonType" RENAME TO "ComponentType";
ALTER TYPE "ComponentType" ADD VALUE 'photo';
ALTER TYPE "ComponentType" ADD VALUE 'input';

-- ===== 2. Перейменування таблиць. Порядок важливий — звільняємо ім'я перш
-- ніж його зайняти: Lesson -> Component (ім'я вільне), старий Module ->
-- Screen (звільняє "Module"), Block -> Module (тепер вільне),
-- BlockCompletion -> ModuleCompletion (ім'я вільне) =====
ALTER TABLE "Lesson" RENAME TO "Component";
ALTER TABLE "Module" RENAME TO "Screen";
ALTER TABLE "Block" RENAME TO "Module";
ALTER TABLE "BlockCompletion" RENAME TO "ModuleCompletion";

-- ===== 3. Перейменування колонок під нові назви батьківських таблиць =====
ALTER TABLE "Component" RENAME COLUMN "moduleId" TO "screenId";
ALTER TABLE "Screen" RENAME COLUMN "blockId" TO "moduleId";
ALTER TABLE "ModuleCompletion" RENAME COLUMN "blockId" TO "moduleId";

-- Component.title стає необов'язковим — обов'язковий лишається лише для
-- quiz (перевіряється в коді, не в БД), решта типів тримають свій
-- заголовок/lead усередині content.
ALTER TABLE "Component" ALTER COLUMN "title" DROP NOT NULL;

-- ===== 4. Перейменування обмежень/індексів під конвенцію Prisma для нових
-- назв таблиць/колонок — щоб наступний `prisma migrate dev --create-only`
-- бачив чисту схему без "фантомних" діффів через застарілі назви =====
ALTER TABLE "Component" RENAME CONSTRAINT "Lesson_pkey" TO "Component_pkey";
ALTER TABLE "Component" RENAME CONSTRAINT "Lesson_moduleId_fkey" TO "Component_screenId_fkey";

ALTER TABLE "Screen" RENAME CONSTRAINT "Module_pkey" TO "Screen_pkey";
ALTER TABLE "Screen" RENAME CONSTRAINT "Module_blockId_fkey" TO "Screen_moduleId_fkey";

ALTER TABLE "Module" RENAME CONSTRAINT "Block_pkey" TO "Module_pkey";
ALTER TABLE "Module" RENAME CONSTRAINT "Block_courseId_fkey" TO "Module_courseId_fkey";

ALTER TABLE "ModuleCompletion" RENAME CONSTRAINT "BlockCompletion_pkey" TO "ModuleCompletion_pkey";
ALTER TABLE "ModuleCompletion" RENAME CONSTRAINT "BlockCompletion_enrollmentId_fkey" TO "ModuleCompletion_enrollmentId_fkey";
ALTER TABLE "ModuleCompletion" RENAME CONSTRAINT "BlockCompletion_blockId_fkey" TO "ModuleCompletion_moduleId_fkey";
ALTER INDEX "BlockCompletion_enrollmentId_blockId_key" RENAME TO "ModuleCompletion_enrollmentId_moduleId_key";
