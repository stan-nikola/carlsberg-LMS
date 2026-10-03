-- CreateIndex
CREATE INDEX "AttemptAnswer_componentId_idx" ON "AttemptAnswer"("componentId");

-- CreateIndex
CREATE INDEX "Component_screenId_idx" ON "Component"("screenId");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE INDEX "EmployeeBadge_badgeId_idx" ON "EmployeeBadge"("badgeId");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE INDEX "Module_courseId_idx" ON "Module"("courseId");

-- CreateIndex
CREATE INDEX "RatingEvent_refType_refId_idx" ON "RatingEvent"("refType", "refId");

-- CreateIndex
CREATE INDEX "Screen_moduleId_idx" ON "Screen"("moduleId");
