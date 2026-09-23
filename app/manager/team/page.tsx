import { getCurrentUser } from "@/lib/session";
import { getManagerTeamRows } from "@/lib/managerOverview";
import { applyTeamFilters, describeTeamQuery, parseTeamQuery } from "@/lib/teamInsights";
import { TeamList } from "@/components/TeamList";

// TODO: Cache Components adoption — той самий опт-аут, що на app/manager/page.js.
export const instant = false;

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * /manager/team — список команди з фільтрами в URL: сюди ведуть усі цифри
 * дашборда /manager (полоса статусів, картки), і та сама
 * applyTeamFilters гарантує, що список за кліком збігається з цифрою.
 * searchParams читається ПІСЛЯ кешованого виклику — інакше App Shell
 * упирався б у динамічне читання першим рядком (Cache Components).
 */
export default async function ManagerTeamPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await getCurrentUser();
  const data = await getManagerTeamRows(me!.id);
  const sp = await searchParams;
  const query = parseTeamQuery(sp);
  const result = applyTeamFilters(data.rows, data.people, query, { now: new Date(data.now), retried: new Set(data.retried) });

  const course = query.course ? data.courses.find((c) => c.slug === query.course) : null;
  const moduleTitle = query.module ? data.courses.flatMap((c) => c.modules).find((m) => m.id === query.module)?.title : null;
  const teamName = query.team ? data.people.find((p) => p.id === query.team)?.name : null;
  const chips = describeTeamQuery(query, course?.title ?? null, moduleTitle ?? null, teamName ?? null);

  return (
    <div className="manager-page manager-team-page">
      <h1 className="greeting hub-greeting-h1">КОМАНДА</h1>
      <TeamList result={result} chips={chips} courseId={course?.id ?? null} courseTitle={course?.title ?? null} />
    </div>
  );
}
