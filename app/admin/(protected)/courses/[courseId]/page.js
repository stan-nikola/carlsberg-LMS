import { AdminCourseEditor } from "@/components/AdminCourseEditor";

// Гейт доступа теперь на уровне app/admin/(protected)/layout.js (проверяет
// /admin-сессию по паролю, см. lib/adminSession.js) — здесь его больше не
// дублируем.
export default async function AdminCourseEditPage({ params }) {
  const { courseId } = await params;
  return <AdminCourseEditor courseId={Number(courseId)} />;
}
