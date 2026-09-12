-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "folderId" INTEGER;

-- CreateTable
CREATE TABLE "CourseFolder" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseFolder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CourseFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFolder" ADD CONSTRAINT "CourseFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CourseFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
