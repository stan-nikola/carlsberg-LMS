-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "cooldownDays" INTEGER;

-- CreateTable
CREATE TABLE "BlockCompletion" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "blockId" INTEGER NOT NULL,
    "scorePercent" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockCompletion_enrollmentId_blockId_key" ON "BlockCompletion"("enrollmentId", "blockId");

-- AddForeignKey
ALTER TABLE "BlockCompletion" ADD CONSTRAINT "BlockCompletion_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockCompletion" ADD CONSTRAINT "BlockCompletion_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;
