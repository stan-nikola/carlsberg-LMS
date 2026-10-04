-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorEmployeeId" INTEGER;

-- CreateIndex
CREATE INDEX "AuditLog_actor_createdAt_idx" ON "AuditLog"("actor", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorEmployeeId_createdAt_idx" ON "AuditLog"("actorEmployeeId", "createdAt");
