-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN     "channels" TEXT NOT NULL DEFAULT 'push,telegram',
ADD COLUMN     "pushed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "telegramSent" INTEGER NOT NULL DEFAULT 0;
-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "telegram" BOOLEAN NOT NULL DEFAULT true;
-- CreateTable
CREATE TABLE "TelegramLink" (
    "employeeId" INTEGER NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("employeeId")
);
-- CreateTable
CREATE TABLE "TelegramInbound" (
    "id" SERIAL NOT NULL,
    "chatId" TEXT NOT NULL,
    "employeeId" INTEGER,
    "username" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramInbound_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_chatId_key" ON "TelegramLink"("chatId");
-- CreateIndex
CREATE INDEX "TelegramInbound_createdAt_idx" ON "TelegramInbound"("createdAt");
-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TelegramInbound" ADD CONSTRAINT "TelegramInbound_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
