import { Skeleton, CardSkeleton } from "@/components/Skeleton";

/**
 * Скелетон САМЕ під форму /hub (app/hub/page.js) — вертикальна колонка
 * "привітання + картки + стрічка з 3 пігулок + список курсів", а НЕ
 * сітка карток, яку дає універсальний PageSkeleton (той розрахований на
 * /manager і каталоги). Невідповідність форми — причина видимого
 * "стрибка" при заміні скелетона на реальний контент (скарга користувача
 * з відео, 2026-09-19): /hub — стартова сторінка PWA (manifest start_url),
 * тож саме її бачать на кожному холодному запуску.
 * Використовується і як Suspense-фолбек layout'а (HubShellSkeleton), і як
 * app/hub/loading.tsx — та сама форма в обох місцях, без стрибка між ними.
 */
export function HubHomeSkeleton() {
  return (
    <section className="hub-screen" role="status" aria-label="Завантаження" aria-hidden="true">
      <Skeleton className="sk-line" style={{ width: "55%", height: 12, marginBottom: 6 }} />
      <Skeleton className="sk-title" style={{ width: "70%" }} />

      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />

      <div className="hub-sec-title">
        <Skeleton className="sk-line" style={{ width: 140, height: 13 }} />
      </div>
      <CardSkeleton />
      <CardSkeleton />
    </section>
  );
}
