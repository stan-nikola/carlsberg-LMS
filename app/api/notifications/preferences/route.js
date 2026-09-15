import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { DEFAULT_PREFERENCES, sanitizePreferences } from "@/lib/notificationTypes";

/** GET — поточні вподобання (дефолти, якщо рядка ще нема) + чи є push-підписки. */
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [prefs, subscriptions] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { employeeId: employee.id } }),
    prisma.pushSubscription.count({ where: { employeeId: employee.id } }),
  ]);
  const { employeeId, updatedAt, ...values } = prefs || {};
  void employeeId;
  void updatedAt;
  return NextResponse.json({ preferences: { ...DEFAULT_PREFERENCES, ...values }, pushDevices: subscriptions });
}

/** PUT — { courses?: bool, deadlines?: bool, … } — часткове оновлення. */
export async function PUT(request) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const patch = sanitizePreferences(body);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const prefs = await prisma.notificationPreference.upsert({
    where: { employeeId: employee.id },
    update: patch,
    create: { employeeId: employee.id, ...patch },
  });
  const { employeeId, updatedAt, ...values } = prefs;
  void employeeId;
  void updatedAt;
  return NextResponse.json({ preferences: values });
}
