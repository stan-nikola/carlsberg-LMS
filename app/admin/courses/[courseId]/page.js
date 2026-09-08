import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { AdminCourseEditor } from "@/components/AdminCourseEditor";

// Гейт на рівні сторінки (окрім гейта в самих /api/admin/* routes —
// без нього не-адмін побачив би порожню/помилкову сторінку замість
// зрозумілого повідомлення).
export default async function AdminCourseEditPage({ params }) {
  const { courseId } = await params;
  const employee = await getCurrentUser();

  if (!hasFullAccess(employee)) {
    return (
      <div className="admin-page">
        <h1>Доступ заборонено</h1>
        <p>Ця сторінка доступна лише адміністраторам (admin/hr_manager).</p>
      </div>
    );
  }

  return <AdminCourseEditor courseId={Number(courseId)} />;
}
