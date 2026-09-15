-- AlterTable
-- CreateTable
CREATE TABLE "RatingRule" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RatingRule_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RatingLevel" (
    "id" SERIAL NOT NULL,
    "threshold" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "RatingLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingEvent" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RatingLevel_threshold_key" ON "RatingLevel"("threshold");

-- CreateIndex
CREATE INDEX "RatingEvent_employeeId_idx" ON "RatingEvent"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "RatingEvent_employeeId_kind_refType_refId_key" ON "RatingEvent"("employeeId", "kind", "refType", "refId");

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

