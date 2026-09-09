-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "targetEmployeeIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
