import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier, getAllSubordinates } from "@/lib/permissions";
import { getHardestQuestions } from "@/lib/managerDashboard";

// GET /api/manager/hardest-questions — окремо від /api/manager/overview
// (аудит швидкодії, 2026-09-19): картка "Найскладніші питання" вимкнена
// за замовчуванням (components/ManagerDashboard.jsx), тож зайвий
// groupBy по QuestionAnswer + findMany по Component не мають виконуватись
// на КОЖЕН заход у /manager — лише коли керівник сам увімкнув цю картку.
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(employee)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const subordinateIds = await getAllSubordinates(employee.id);
  const hardestQuestions = await getHardestQuestions(subordinateIds);
  return NextResponse.json({ hardestQuestions });
}
