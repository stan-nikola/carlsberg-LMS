import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { adminGuard } from "@/lib/adminAuth";
import { recalculateAll } from "@/lib/rating";

/** POST — стерти журнал і перерахувати всіх за поточними правилами. */
export async function POST() {
  const denied = await adminGuard();
  if (denied) return denied;
  const result = await recalculateAll();
  console.info("[rating] recalculated by admin", result);
  await audit("rating.recalculate", "rating", null, result);
  return NextResponse.json(result);
}
