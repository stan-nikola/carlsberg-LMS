-- AlterTable
ALTER TABLE "Territory" ADD COLUMN     "parentId" INTEGER;

-- AddForeignKey
ALTER TABLE "Territory" ADD CONSTRAINT "Territory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
