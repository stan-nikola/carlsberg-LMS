import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/adminAuth";
import { recalculateAll } from "@/lib/rating";

/** POST — стерти журнал і перерахувати всіх за поточними правилами. */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await recalculateAll();
  console.info("[rating] recalculated by admin", result);
  await audit("rating.recalculate", "rating", null, result);
  return NextResponse.json(result);
}
