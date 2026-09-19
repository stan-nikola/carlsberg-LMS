import { HubHomeSkeleton } from "@/components/HubHomeSkeleton";

// Усі решта вкладок /hub (achievements/learn/profile/notifications) мають
// власний loading.tsx — цей лишається фактично лише для кореневої /hub
// (app/hub/page.js), тому форма скелетона тепер під ЇЇ реальний контент
// (HubHomeSkeleton), а не універсальна сітка карток (аудит "стрибок при
// заміні скелетона", 2026-09-19).
export default function HubLoading() {
  return <HubHomeSkeleton />;
}
