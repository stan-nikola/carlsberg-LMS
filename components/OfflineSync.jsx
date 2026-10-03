"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { flushOutbox } from "@/lib/offlineOutbox";

/** Досилає результати, накопичені офлайн (lib/offlineOutbox.js), і оновлює екран. */
export function OfflineSync() {
  const router = useRouter();
  useEffect(() => {
    // Ім'я з форми входу більше не зберігається; прибираємо старий ключ.
    try {
      localStorage.removeItem("employee_display_name_v1");
    } catch {}
    let busy = false;
    async function sync() {
      if (busy) return;
      busy = true;
      try {
        if ((await flushOutbox()) > 0) router.refresh();
      } finally {
        busy = false;
      }
    }
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [router]);
  return null;
}
