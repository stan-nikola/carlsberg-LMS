import { AdminCourseEditor } from "@/components/AdminCourseEditor";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Гейт доступа теперь на уровне app/admin/(protected)/layout.js (проверяет
// /admin-сессию по паролю, см. lib/adminSession.js) — здесь его больше не
// дублируем.
export default async function AdminCourseEditPage({ params }) {
  const { courseId } = await params;
  return <AdminCourseEditor courseId={Number(courseId)} />;
}
