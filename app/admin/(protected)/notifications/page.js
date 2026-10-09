import { AdminBroadcast } from "@/components/admin/AdminBroadcast";
import { AdminTelegram } from "@/components/admin/AdminTelegram";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function AdminNotificationsPage() {
  return (
    <AdminBroadcast>
      <AdminTelegram />
    </AdminBroadcast>
  );
}
