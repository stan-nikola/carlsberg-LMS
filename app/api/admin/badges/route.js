import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { ensureAutoBadgesExist } from "@/lib/badgeRules";

// GET /api/admin/badges — усі типи ачивок (manual + auto) для /admin/badges
// і для пікера видачі на картці співробітника. ensureAutoBadgesExist() —
// щоб авто-типи були видні в списку одразу, не лише після першого прогону
// cron.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ensureAutoBadgesExist();
  const badges = await prisma.badge.findMany({
    orderBy: [{ kind: "asc" }, { title: "asc" }],
    select: { id: true, code: true, title: true, description: true, icon: true, kind: true, _count: { select: { awards: true } } },
  });
  return NextResponse.json({ badges });
}

// POST /api/admin/badges — створення НОВОГО manual-типу (заслуги). auto-
// типи заводяться лише ensureAutoBadgesExist(), не через цей ендпоінт —
// ruleKey має вказувати на реальну функцію в lib/badgeRules.js, довільний
// новий auto-тип нізвідки нізвідки не порахується.
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // Стабільний code із назви (лишається стабільним навіть якщо title
  // потім перейменують) + timestamp-суфікс, щоб два різних типи з
  // однаковою назвою (напр. "Співробітник місяця" різними адмінами) не
  // зіткнулись на @@unique(code).
  const slug = title
    .toLowerCase()
    .replace(/[^a-zа-яїієґ0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  const code = `manual_${slug}_${Date.now()}`;

  const created = await prisma.badge.create({
    data: {
      code,
      title,
      description: body.description || null,
      icon: body.icon || "⭐",
      kind: "manual",
      ruleKey: null,
    },
    select: { id: true, code: true, title: true, description: true, icon: true, kind: true },
  });
  return NextResponse.json(created, { status: 201 });
}
