import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/tokens/:tokenId — відкликає токен (revokedAt), не
// видаляє рядок фізично — лишається слід, хто й коли мав доступ до живого
// підключення, навіть після відкликання.
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { tokenId } = await params;
  await prisma.adminApiToken.update({
    where: { id: Number(tokenId) },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
