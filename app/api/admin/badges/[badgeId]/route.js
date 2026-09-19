import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { syncBadgeAwards } from "@/lib/rating";

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
  if ("points" in body) {
    const points = Number(body.points);
    if (!Number.isInteger(points) || points < 0) return NextResponse.json({ error: "points must be a non-negative integer" }, { status: 400 });
    data.points = points;
  }
  if ("hiddenUntilEarned" in body) data.hiddenUntilEarned = body.hiddenUntilEarned === true;
  if (data.title === "") return NextResponse.json({ error: "title must not be empty" }, { status: 400 });

  const updated = await prisma.badge.update({
    where: { id: Number(badgeId) },
    data,
    select: { id: true, code: true, title: true, description: true, icon: true, kind: true, points: true, hiddenUntilEarned: true },
  });
  // Ціна відзнаки — «жива», а не знімок на момент видачі (рішення
  // користувача 2026-09-19): підняв «Кращій СВ» зі 100 до 1000 — усі, хто
  // її має, одразу мають 1000. Інакше на екрані «Досягнення» плашка
  // відзнаки показувала +1000, а в сумі балів лежало 100.
  const rating = "points" in data ? await syncBadgeAwards(updated.id) : null;
  await audit("badge.update", "badge", updated.id, { ...data, rating });
  return NextResponse.json({ ...updated, rating });
}

// DELETE /api/admin/badges/:badgeId — лише manual-типи (auto пересоздасть
// ensureAutoBadgesExist). Якщо відзнаку вже комусь видано — 409 з
// кількістю; ?force=1 видаляє разом із видачами та їхніми балами рейтингу.
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { badgeId } = await params;
  const id = Number(badgeId);
  const badge = await prisma.badge.findUnique({ where: { id }, select: { id: true, title: true, kind: true, _count: { select: { awards: true } } } });
  if (!badge) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (badge.kind !== "manual") return NextResponse.json({ error: "Автоматичні відзнаки видалити не можна" }, { status: 400 });

  const force = new URL(request.url).searchParams.get("force") === "1";
  if (badge._count.awards > 0 && !force) {
    return NextResponse.json({ error: `Відзнаку вже видано ${badge._count.awards} співробітник(ам).`, awardsCount: badge._count.awards }, { status: 409 });
  }
  await prisma.$transaction([
    prisma.ratingEvent.deleteMany({ where: { refType: "badge", refId: id } }),
    prisma.employeeBadge.deleteMany({ where: { badgeId: id } }),
    prisma.badge.delete({ where: { id } }),
  ]);
  await audit("badge.delete", "badge", id, { title: badge.title, awardsRemoved: badge._count.awards });
  return NextResponse.json({ ok: true, awardsRemoved: badge._count.awards });
}
