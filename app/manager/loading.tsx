import { PageSkeleton } from "@/components/Skeleton";

/** Показується миттєво при переході між розділами /manager, поки сервер
 *  рендерить нову сторінку — каркас (сайдбар/appbar) лишається на місці.
 *
 *  `admin-page manager-page` — обидва класи разом, як на реальних сторінках
 *  (ManagerDashboard.jsx: `admin-page manager-page`): саме `.admin-page`
 *  дає `width:100%`/`min-height:100vh`/фон (manager.css docs, ~рядок 7),
 *  `.manager-page` — лише додатковий паддинг. Самого `manager-page` без
 *  `admin-page` бракувало — скелетон рендерився в природну висоту вмісту
 *  замість повного вьюпорту, і щойно дані приходили, сторінка "стрибала"
 *  (той самий клас багу, що й app/courses/[slug]/loading.tsx, 2026-09-19). */
export default function ManagerLoading() {
  return (
    <div className="admin-page manager-page">
      <PageSkeleton />
    </div>
  );
}
