-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "autoAssignedAt" TIMESTAMP(3),
ADD COLUMN     "publishAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "unlockAfterDays" INTEGER;
