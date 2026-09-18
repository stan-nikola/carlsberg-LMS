import { PageSkeleton } from "@/components/Skeleton";

/** Вхід у плеєр з картки курсу: ТА САМА рамка, що й у самого плеєра
 *  (.stage.stage--course-player/.course-card — не голий .stage), усередині —
 *  скелетон, а не старий екран.
 *
 *  Клас `stage--course-player` тут обов'язковий, не косметика: саме він
 *  вмикає desktop-розтяжку картки на весь вьюпорт (app/globals.css,
 *  `.stage--course-player .course-card { width:min(1400px,96vw);
 *  height:100vh }` + зняття padding у body:has(...)). Без нього скелетон
 *  показувався у вузькій ~400px мобільній рамці (дефолт голого .stage), а
 *  щойно даних приходили — реальний плеєр перемальовувався на весь екран:
 *  видимий стрибок розміру картки в момент завантаження (2026-09-19,
 *  скарга користувача "кривий скелетон", "на весь вьюпорт"). */
export default function CourseLoading() {
  return (
    <div className="stage stage--course-player">
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
