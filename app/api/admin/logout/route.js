import { NextResponse } from "next/server";
import { destroyAdminSession } from "@/lib/adminSession";
import { audit } from "@/lib/audit";

export async function POST() {
  await audit("admin.logout", "admin");
  await destroyAdminSession();
  return NextResponse.json({ ok: true });
}
