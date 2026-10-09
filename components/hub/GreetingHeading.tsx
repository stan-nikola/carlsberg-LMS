"use client";

import { greetingForHour } from "@/lib/localDate";
import { useDeviceValue } from "@/components/ui/LocalDate";

/**
 * "ДОБРОГО ВЕЧОРА!" на Home — та сама kicker-стилістика (.greeting), що й
 * заголовки решти вкладок хаба (НАВЧАННЯ / МІЙ ПРОГРЕС / ПРОФІЛЬ), одним
 * шрифтом. Ім'я — на зеленій картці нижче (ProfileCard), тут не дублюємо.
 * greet — привітання сервера (український час); у браузері — за годиною пристрою.
 */
export function GreetingHeading({ greet }: { greet: string }) {
  const text = useDeviceValue(() => greetingForHour(new Date().getHours()), () => greet);
  return <h1 className="greeting hub-greeting-h1">{text}!</h1>;
}
