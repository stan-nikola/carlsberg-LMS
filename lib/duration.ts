/** «45 хв», «1 год», «2 год 15 хв» — тривалість у хвилинах. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} хв`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} год ${rest} хв` : `${hours} год`;
}

/** Скільки ще чекати до моменту `until` — щонайменше «1 хв». */
export function formatWait(until: Date, now: Date = new Date()): string {
  return formatMinutes(Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60000)));
}
