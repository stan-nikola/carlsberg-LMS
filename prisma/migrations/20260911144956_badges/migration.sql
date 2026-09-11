-- CreateEnum
CREATE TYPE "BadgeKind" AS ENUM ('manual', 'auto');

-- CreateTable
CREATE TABLE "Badge" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "kind" "BadgeKind" NOT NULL,
    "ruleKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBadge" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "badgeId" INTEGER NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "awardedById" INTEGER,
    "note" TEXT,

    CONSTRAINT "EmployeeBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeBadge_employeeId_badgeId_key" ON "EmployeeBadge"("employeeId", "badgeId");

-- AddForeignKey
ALTER TABLE "EmployeeBadge" ADD CONSTRAINT "EmployeeBadge_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBadge" ADD CONSTRAINT "EmployeeBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBadge" ADD CONSTRAINT "EmployeeBadge_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
