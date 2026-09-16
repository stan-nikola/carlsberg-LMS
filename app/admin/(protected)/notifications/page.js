import { AdminBroadcast } from "@/components/AdminBroadcast";
import { AdminTelegram } from "@/components/AdminTelegram";

export default function AdminNotificationsPage() {
  return (
    <AdminBroadcast>
      <AdminTelegram />
    </AdminBroadcast>
  );
}
