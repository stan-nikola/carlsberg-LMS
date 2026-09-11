import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// PATCH /api/admin/badges/:badgeId — редагування вигляду типу ачивки
// (title/description/icon). kind/ruleKey/code НЕ редагуються тут навіть
// для auto-типів — ruleKey прив'язаний до конкретної функції в
// lib/badgeRules.js, зміна його вручну зламала б авто-нарахування.
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { badgeId } = await params;
  const body = await request.json();
  const data = {};
  if ("title" in body) data.title = String(body.title || "").trim();
  if ("description" in body) data.description = body.description || null;
  if ("icon" in body) data.icon = body.icon || null;
  if (data.title === "") return NextResponse.json({ error: "title must not be empty" }, { status: 400 });

  const updated = await prisma.badge.update({
    where: { id: Number(badgeId) },
    data,
    select: { id: true, code: true, title: true, description: true, icon: true, kind: true },
  });
  return NextResponse.json(updated);
}
