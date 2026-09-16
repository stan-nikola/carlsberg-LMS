import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/adminSession";
import { audit } from "@/lib/audit";
import { getSavedDesign, resetDesign, saveDesign } from "@/lib/designSettings";

/**
 * Збережені «для всіх» дизайн-токени (лише супер-адмін, SUPER_ADMIN_PASSWORD).
 *  GET    — що зараз збережено (values + updatedAt) або null
 *  PUT    — { values } зберегти (whitelist у lib/designSettings.ts)
 *  DELETE — повернути дефолти tokens.css для всіх
 */
export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ saved: await getSavedDesign() });
}

export async function PUT(request: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const saved = await saveDesign(body.values);
  await audit("design.save", "design", null, saved.values);
  return NextResponse.json({ saved });
}

export async function DELETE() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await resetDesign();
  await audit("design.reset", "design", null);
  return NextResponse.json({ saved: null });
}
