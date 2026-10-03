-- AlterTable
ALTER TABLE "AdminApiToken" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "firstPassedAt" TIMESTAMP(3),
ADD COLUMN     "overdueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ModuleCompletion" ADD COLUMN     "firstPassedAttempt" INTEGER,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ModuleAttempt" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "clientAttemptId" TEXT,
    "scoreRaw" INTEGER,
    "scoreMax" INTEGER,
    "scorePercent" INTEGER,
    "passed" BOOLEAN,

    CONSTRAINT "ModuleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "attemptId" INTEGER NOT NULL,
    "componentId" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("attemptId","componentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleAttempt_clientAttemptId_key" ON "ModuleAttempt"("clientAttemptId");

-- CreateIndex
CREATE INDEX "ModuleAttempt_enrollmentId_moduleId_idx" ON "ModuleAttempt"("enrollmentId", "moduleId");

-- AddForeignKey
ALTER TABLE "ModuleAttempt" ADD CONSTRAINT "ModuleAttempt_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleAttempt" ADD CONSTRAINT "ModuleAttempt_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ModuleAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill — лише те, що виводиться з наявних даних без припущень.
-- До цієї міграції ModuleCompletion.completedAt і БУЛА часом останньої спроби.
UPDATE "ModuleCompletion" SET "lastAttemptAt" = "completedAt" WHERE "lastAttemptAt" IS NULL;
-- Складено при єдиній спробі — отже, з першого разу. Для attemptCount > 1
-- невідомо, на якій спробі вперше склали (рядок перезаписувався) — лишаємо NULL.
UPDATE "ModuleCompletion" SET "firstPassedAttempt" = 1 WHERE "passed" = true AND "attemptCount" = 1;
-- Перше складання курсу — найраніша успішна спроба з історії EnrollmentAttempt.
UPDATE "Enrollment" e SET "firstPassedAt" = a.first_passed
FROM (SELECT "enrollmentId", MIN("completedAt") AS first_passed FROM "EnrollmentAttempt" WHERE "passed" = true GROUP BY "enrollmentId") a
WHERE e."id" = a."enrollmentId" AND e."firstPassedAt" IS NULL;
-- Складено без жодної спроби в історії (ручна корекція адміном) — дата, яку
-- адмін сам записав як дату складання.
UPDATE "Enrollment" SET "firstPassedAt" = "completedAt"
WHERE "firstPassedAt" IS NULL AND "passed" = true AND "completedAt" IS NOT NULL;
