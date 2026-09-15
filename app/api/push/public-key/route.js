import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/webPush";

// Публічний VAPID-ключ — не секрет (він і так їде в браузер як
// applicationServerKey), але живе в env поруч із приватним, тому віддаємо
// через API, а не через NEXT_PUBLIC_* на етапі збірки: ключ можна змінити
// без перезбирання. null → клієнт показує «push недоступний».
export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}
