import { NextResponse } from "next/server";
import { requireManager } from "@/lib/session";
import { getAllSubordinates } from "@/lib/permissions";
import { getHardestQuestions } from "@/lib/managerDashboard";

// GET /api/manager/hardest-questions — окремо від решти кабінету
// (аудит швидкодії, 2026-09-19): картка "Найскладніші питання" вимкнена
// за замовчуванням (components/ManagerDashboard.jsx), тож зайвий
// groupBy по QuestionAnswer + findMany по Component не мають виконуватись
// на КОЖЕН заход у /manager — лише коли керівник сам увімкнув цю картку.
export async function GET() {
  const { manager: employee, denied } = await requireManager();
  if (denied) return denied;

  const subordinateIds = await getAllSubordinates(employee.id);
  const hardestQuestions = await getHardestQuestions(subordinateIds);
  return NextResponse.json({ hardestQuestions });
}
