import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// PATCH /api/admin/course-folders/:folderId — { name? } перейменування,
// { parentId? } переміщення (drag&drop папки на папку). Заборона циклу —
// не можна перенести папку всередину її ж нащадка (той самий принцип, що
// переприв'язка керівника в /admin/employees).
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { folderId } = await params;
  const id = Number(folderId);
  const body = await request.json();
  const data = {};

  if ("name" in body) {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
    data.name = name;
  }

  if ("name" in data) {
    // Перевіряємо дублікат у межах ЦІЛЬОВОЇ батьківської папки: якщо цей
    // самий запит одночасно й переміщує папку (parentId у body), рахуємо
    // від нового parentId, інакше — від поточного.
    const targetParentId =
      "parentId" in body ? (body.parentId === null ? null : Number(body.parentId)) : (await prisma.courseFolder.findUnique({ where: { id }, select: { parentId: true } }))?.parentId ?? null;
    const duplicate = await prisma.courseFolder.findFirst({
      where: { id: { not: id }, parentId: targetParentId, name: { equals: data.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Папка з такою назвою вже існує тут." }, { status: 409 });
    }
  }

  if ("parentId" in body) {
    const newParentId = body.parentId === null ? null : Number(body.parentId);
    if (newParentId === id) {
      return NextResponse.json({ error: "folder cannot be its own parent" }, { status: 400 });
    }
    if (newParentId != null) {
      // Іти вгору від newParentId — якщо натрапимо на id (саму папку, що
      // переміщується), це був би цикл.
      let cursor = newParentId;
      const seen = new Set();
      while (cursor != null) {
        if (cursor === id) {
          return NextResponse.json(
            { error: "cannot move folder into its own subfolder (would create a cycle)" },
            { status: 400 }
          );
        }
        if (seen.has(cursor)) break; // захист від вже зіпсованих даних — не зациклюватись самому
        seen.add(cursor);
        const parent = await prisma.courseFolder.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = parent?.parentId ?? null;
      }
    }
    data.parentId = newParentId;
  }

  const updated = await prisma.courseFolder.update({
    where: { id },
    data,
    select: { id: true, name: true, parentId: true },
  });
  return NextResponse.json(updated);
}

// DELETE /api/admin/course-folders/:folderId — відмовляє (409), якщо в
// папці лишились курси або підпапки, той самий delete-guard патерн, що
// вже є для курсів/enrollments — не видаляти "тихо" разом із вмістом.
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { folderId } = await params;
  const id = Number(folderId);

  const [courseCount, subfolderCount] = await Promise.all([
    prisma.course.count({ where: { folderId: id } }),
    prisma.courseFolder.count({ where: { parentId: id } }),
  ]);
  if (courseCount > 0 || subfolderCount > 0) {
    return NextResponse.json(
      {
        error: `У папці ${courseCount} курс(ів) і ${subfolderCount} підпапка(ок). Спершу перемістіть або видаліть вміст.`,
        courseCount,
        subfolderCount,
      },
      { status: 409 }
    );
  }

  await prisma.courseFolder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
