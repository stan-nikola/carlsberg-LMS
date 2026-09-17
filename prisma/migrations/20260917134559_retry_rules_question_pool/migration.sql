-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "retryCooldownHours" INTEGER,
ADD COLUMN     "retryFreeAttempts" INTEGER;

-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "questionPoolSize" INTEGER,
ADD COLUMN     "retryCooldownHours" INTEGER,
ADD COLUMN     "retryFreeAttempts" INTEGER;

-- AlterTable
ALTER TABLE "ModuleCompletion" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 1;
