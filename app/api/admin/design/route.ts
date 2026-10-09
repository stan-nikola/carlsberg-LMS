import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getSavedDesign, resetDesign, saveDesign } from "@/lib/designSettings";
import { adminGuard } from "@/lib/adminAuth";

/**
 * Збережені «для всіх» дизайн-токени (лише супер-адмін, SUPER_ADMIN_PASSWORD).
 *  GET    — що зараз збережено (values + updatedAt) або null
 *  PUT    — { values } зберегти (whitelist у lib/designSettings.ts)
 *  DELETE — повернути дефолти tokens.css для всіх
 */
export async function GET() {
  const denied = await adminGuard("super");
  if (denied) return denied;
  return NextResponse.json({ saved: await getSavedDesign() });
}

export async function PUT(request: Request) {
  const denied = await adminGuard("super");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const saved = await saveDesign(body.values);
  await audit("design.save", "design", null, saved.values);
  return NextResponse.json({ saved });
}

export async function DELETE() {
  const denied = await adminGuard("super");
  if (denied) return denied;
  await resetDesign();
  await audit("design.reset", "design", null);
  return NextResponse.json({ saved: null });
}
