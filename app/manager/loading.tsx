import { PageSkeleton } from "@/components/Skeleton";

/** Показується миттєво при переході між розділами /manager, поки сервер
 *  рендерить нову сторінку — каркас (сайдбар/appbar) лишається на місці. */
export default function ManagerLoading() {
  return (
    <div className="manager-page">
      <PageSkeleton />
    </div>
  );
}
