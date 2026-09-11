import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { getAllSubordinates } from "@/lib/permissions";

const VALID_ROLES = ["employee", "admin", "hr_manager"];
// Поля, які адмін може реально редагувати з детальної картки співробітника
// (Фаза A адмінки). externalCode свідомо ВІДСУТНІЙ у цьому списку — це
// login-ключ, що збігається із зовнішньою системою (Monolit Agent), його
// зміна зламала б і вхід, і майбутню синхронізацію; якщо колись знадобиться
// його виправити — окремий, явно небезпечний шлях, не звичайний PATCH.
const EDITABLE_FIELDS = ["name", "email", "positionId", "territoryId", "managerId", "isActive", "role"];

const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  externalCode: true,
  isActive: true,
  firstLoginAt: true,
  createdAt: true,
  positionId: true,
  position: { select: { id: true, code: true, name: true, level: true } },
  territoryId: true,
  territory: { select: { id: true, name: true } },
  managerId: true,
  manager: { select: { id: true, name: true, externalCode: true } },
  _count: { select: { subordinates: true, enrollments: true } },
};

// GET /api/admin/employees/:employeeId — повна картка для детальної
// сторінки (app/admin/(protected)/employees/[employeeId]/page.js): усі
// поля + позиція/територія/керівник розгорнуті об'єктами + кількість
// підлеглих і enrollments (щоб UI міг попередити перед деактивацією, не
// підвантажуючи для цього окремо весь список).
export async function GET(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeId } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id: Number(employeeId) },
    select: EMPLOYEE_SELECT,
  });
  if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(employee);
}

// PATCH /api/admin/employees/:employeeId — раніше єдине settable-поле було
// role (призначення адмін/hr_manager); тепер повний редактор картки:
// name/email/positionId/territoryId/managerId/isActive/role. Приймає лише
// поля, які реально прийшли в тілі запиту (часткове оновлення) — щоб UI
// міг зберігати, наприклад, тільки зміну isActive, не пересилаючи все.
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeId } = await params;
  const id = Number(employeeId);
  const body = await request.json();

  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    data[field] = body[field];
  }

  if ("role" in data && !VALID_ROLES.includes(data.role)) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }
  if ("name" in data && !String(data.name || "").trim()) {
    return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
  }

  if ("managerId" in data && data.managerId != null) {
    const newManagerId = Number(data.managerId);
    if (newManagerId === id) {
      return NextResponse.json({ error: "employee cannot be their own manager" }, { status: 400 });
    }
    // Заборона циклу: новий керівник не може бути власним нащадком цього
    // співробітника — інакше дерево підпорядкування розірветься на
    // замкнене кільце. getAllSubordinates вже є (lib/permissions.js,
    // BFS) — той самий виклик, що будує дерево команди в /manager.
    const subordinateIds = await getAllSubordinates(id);
    if (subordinateIds.includes(newManagerId)) {
      return NextResponse.json(
        { error: "cannot move employee under their own subordinate (would create a cycle)" },
        { status: 400 }
      );
    }
    data.managerId = newManagerId;
  }
  if ("positionId" in data && data.positionId != null) data.positionId = Number(data.positionId);
  if ("territoryId" in data && data.territoryId != null) data.territoryId = Number(data.territoryId);

  try {
    const updated = await prisma.employee.update({
      where: { id },
      data,
      select: EMPLOYEE_SELECT,
    });
    return NextResponse.json(updated);
  } catch (err) {
    // P2002 — унікальний email вже зайнятий іншим співробітником.
    if (err.code === "P2002") {
      return NextResponse.json({ error: "email already in use" }, { status: 409 });
    }
    throw err;
  }
}
