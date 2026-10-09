import type { compareTeams } from "@/lib/teamInsights";

/** Корзина розподілу (дедлайни, бали, тривалість). */
export type Bucket = { key: string; label: string; count: number; alert?: boolean };

/** lib/managerDashboard.js getDashboardStats — те, що читають картки. */
export type DashboardStats = {
  completionRate: number;
  passRate: number;
  onTimeRate: number;
  startedRate: number;
  deadlineHorizon: Bucket[];
  scoreDistribution: Bucket[];
  firstAttempt: { total: number; pct: number; passedFirst: number; retried: number };
  durations: { total: number; buckets: Bucket[]; medianSeconds: number | null; medianActiveSeconds: number | null };
  courseBreakdown: { id: number; slug: string; title: string; completed: number; total: number; pct: number }[];
  hardestModules: { id: number; title: string; course?: string | null; avgAttempts: number; failed: number; total: number; pct: number }[];
};

/** Тиждень тренду: складені модулі й хто саме складав. */
export type WeekTrend = { label: string; weekIndex: number; count: number; people: { name: string; count: number }[] };

export type TeamCompareRow = ReturnType<typeof compareTeams>[number];

export type HardestQuestion = { id: number; title: string; module: string; course: string; correct: number; total: number; pct: number };

export type HardestQuestionsState = { loading: boolean; items: HardestQuestion[] | null; error: boolean };
