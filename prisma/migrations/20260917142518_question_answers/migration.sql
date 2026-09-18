-- CreateTable
CREATE TABLE "QuestionAnswer" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "componentId" INTEGER NOT NULL,
    "moduleId" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionAnswer_componentId_idx" ON "QuestionAnswer"("componentId");

-- CreateIndex
CREATE INDEX "QuestionAnswer_enrollmentId_idx" ON "QuestionAnswer"("enrollmentId");

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;
