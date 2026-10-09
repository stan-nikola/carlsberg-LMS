import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { adminGuard } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/tokens/:tokenId — відкликає токен (revokedAt), не
// видаляє рядок фізично — лишається слід, хто й коли мав доступ до живого
// підключення, навіть після відкликання.
export async function DELETE(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { tokenId } = await params;
  await prisma.adminApiToken.update({
    where: { id: Number(tokenId) },
    data: { revokedAt: new Date() },
  });
  await audit("token.revoke", "token", tokenId);
  return NextResponse.json({ ok: true });
}
