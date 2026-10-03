import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Аналог перевірки telesale_profile_v1 в legacy js/main.js — тільки тепер
// джерело правди сесія-cookie (БД), а не localStorage. «На головну» з
// плеєра й входу веде сюди, а не на /hub: керівника одразу в /manager, без
// проміжного телефонного скелетона хаба на десктопі.
export default async function RootPage() {
  const employee = await getCurrentUser();
  redirect(!employee ? "/register" : isManagerTier(employee) ? "/manager" : "/hub");
}
