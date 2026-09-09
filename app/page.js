import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

// Аналог перевірки telesale_profile_v1 в legacy js/main.js — тільки тепер
// джерело правди сесія-cookie (БД), а не localStorage.
export default async function RootPage() {
  const employee = await getCurrentUser();
  redirect(employee ? "/hub" : "/register");
}
