import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken } from "@/lib/adminApiToken";

// GET /api/data/courses — див. app/api/data/employees/route.js (той самий
// Bearer-токен, той самий Power Query сценарій).
export async function GET(request) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courses = await prisma.course.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      category: true,
      isMandatory: true,
      deadlineDays: true,
      publishAt: true,
    },
  });

  return NextResponse.json(courses);
}
