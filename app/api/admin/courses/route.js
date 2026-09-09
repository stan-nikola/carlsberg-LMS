import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { slugify, uniqueSlug } from "@/lib/slug";

// GET /api/admin/courses — легкий список курсів із блоками (без
// модулів/уроків) для дерева на дашборді /admin.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const courses = await prisma.course.findMany({
    orderBy: { title: "asc" },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(courses);
}

// POST /api/admin/courses — { title, description?, isMandatory?,
// deadlineDays?, targetPositions?, targetTerritories?, publishAt? }
// slug генерується з title автоматично (транслітерація + унікальність).
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const slug = await uniqueSlug(slugify(body.title));

  const course = await prisma.course.create({
    data: {
      slug,
      title: body.title,
      description: body.description || null,
      isMandatory: Boolean(body.isMandatory),
      deadlineDays: body.deadlineDays === "" || body.deadlineDays == null ? null : Number(body.deadlineDays),
      targetPositions: body.targetPositions || [],
      targetTerritories: body.targetTerritories || [],
      publishAt: body.publishAt ? new Date(body.publishAt) : null,
    },
    include: { blocks: true },
  });
  return NextResponse.json(course, { status: 201 });
}
