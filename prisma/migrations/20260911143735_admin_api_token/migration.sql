-- CreateTable
CREATE TABLE "AdminApiToken" (
    "id" SERIAL NOT NULL,
    "label" TEXT,
    "tokenHash" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AdminApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminApiToken_tokenHash_key" ON "AdminApiToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "AdminApiToken" ADD CONSTRAINT "AdminApiToken_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
