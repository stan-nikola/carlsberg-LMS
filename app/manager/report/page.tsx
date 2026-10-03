import { ReportScreen } from "@/components/ReportScreen";

// TODO: Cache Components adoption — той самий опт-аут, що на app/manager/page.js.
export const instant = false;

/**
 * /manager/report?cards=… — Excel-звіт на iPhone/iPad (2026-10-03). Файл
 * готується тут же, у застосунку (cookie-сесія), і віддається через системне
 * меню iOS; угорі — «Закрити» назад у кабінет. Сесію й роль перевіряє
 * лейаут /manager, доступ до даних — сам /api/manager/export.
 */
export default async function ManagerReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ReportScreen cards={typeof sp.cards === "string" ? sp.cards : ""} />;
}
