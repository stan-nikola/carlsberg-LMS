// Дані /hub і /manager кешуються у браузері окремо для кожної сторінки
// ("use cache: private"): серверний revalidateTag після збереженого модуля
// не чіпає копію головної, яку браузер уже тримає. Плеєр ставить позначку,
// оболонка (HubShell/ManagerShell) на наступному екрані робить router.refresh().
const KEY = "carls_progress_dirty";

export function markProgressDirty(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {}
}

export function consumeProgressDirty(): boolean {
  try {
    if (sessionStorage.getItem(KEY) !== "1") return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
