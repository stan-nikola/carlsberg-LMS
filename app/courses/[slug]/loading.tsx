import { PageSkeleton } from "@/components/Skeleton";

/** Вхід у плеєр з картки курсу: та сама телефонна рамка, що й у самого
 *  плеєра (.stage/.course-card), усередині — скелетон, а не старий екран. */
export default function CourseLoading() {
  return (
    <div className="stage">
      <div className="course-col">
        <div className="course-card">
          <div className="cp-viewport">
            <div className="cp-screen">
              <PageSkeleton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
