-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "assignOnFirstLogin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certificateEnabled" BOOLEAN NOT NULL DEFAULT true;
