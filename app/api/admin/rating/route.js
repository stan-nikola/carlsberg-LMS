import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { getRules, getLevels } from "@/lib/rating";

/** GET — правила (ваги) і рівні. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [rules, levels] = await Promise.all([getRules(), getLevels()]);
  return NextResponse.json({ rules, levels });
}

/**
 * PUT — { rules: [{key, points, enabled}], levels: [{threshold, label}] }.
 * Ваги застосовуються до НОВИХ нарахувань; минуле — лише через
 * /api/admin/rating/recalculate. Рівні — повна заміна списку (перший
 * поріг завжди 0).
 */
export async function PUT(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const ops = [];
  for (const r of Array.isArray(body.rules) ? body.rules : []) {
    const points = Number(r.points);
    if (typeof r.key !== "string" || !Number.isInteger(points) || points < 0) continue;
    ops.push(prisma.ratingRule.update({ where: { key: r.key }, data: { points, enabled: r.enabled !== false } }));
  }
  if (Array.isArray(body.levels)) {
    const levels = body.levels
      .map((l) => ({ threshold: Number(l.threshold), label: String(l.label || "").trim() }))
      .filter((l) => Number.isInteger(l.threshold) && l.threshold >= 0 && l.label)
      .sort((a, b) => a.threshold - b.threshold);
    if (levels.length === 0 || levels[0].threshold !== 0) {
      return NextResponse.json({ error: "Перший рівень має починатись з 0 балів" }, { status: 400 });
    }
    if (new Set(levels.map((l) => l.threshold)).size !== levels.length) {
      return NextResponse.json({ error: "Пороги рівнів мають бути різними" }, { status: 400 });
    }
    ops.push(prisma.ratingLevel.deleteMany({}), prisma.ratingLevel.createMany({ data: levels }));
  }
  await prisma.$transaction(ops);
  const [rules, levels] = await Promise.all([getRules(), getLevels()]);
  await audit("rating.rules.update", "rating", null, { rules, levels });
  return NextResponse.json({ rules, levels });
}
