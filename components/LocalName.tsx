"use client";

import { useEffect, useState } from "react";
import { getLocalDisplayName } from "@/lib/localName";

/**
 * Ім'я співробітника там, де в базі лише заглушка з посади (польові ролі
 * без email): після монтування підміняється на ім'я з localStorage цього
 * пристрою — те саме, що роблять ProfileCard і GreetingHeading. Працює
 * лише для САМОГО користувача: імена інших людей на чужому пристрої взяти
 * нізвідки, вони лишаються як у базі.
 */
export function LocalName({ dbName, hasEmail }: { dbName: string; hasEmail: boolean }) {
  const [name, setName] = useState(dbName);
  useEffect(() => {
    if (hasEmail) return;
    const local = getLocalDisplayName();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (local) setName(local);
  }, [hasEmail]);
  return <>{name}</>;
}
