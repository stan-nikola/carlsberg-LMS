"use client";

import { useEffect, useState } from "react";
import { getLocalDisplayName } from "@/lib/localName";

/**
 * "Вітаємо, {ім'я}!" на Home — та сама підміна на localStorage-ім'я, що
 * й ProfileCard, для тих самих співробітників без email.
 */
export function GreetingHeading({ dbName, hasEmail, greet }) {
  const [displayName, setDisplayName] = useState(dbName);

  useEffect(() => {
    // Те саме, що й у ProfileCard.jsx - lazy useState тут не підходить
    // через SSR, значення можна прочитати лише після монтування.
    if (!hasEmail) {
      const local = getLocalDisplayName();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (local) setDisplayName(local);
    }
  }, [hasEmail]);

  return (
    <h1 className="hub-h1">
      {displayName ? `Вітаємо, ${displayName.split(" ")[0]}!` : `${greet}!`}
    </h1>
  );
}
