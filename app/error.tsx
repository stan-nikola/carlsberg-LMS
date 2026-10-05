"use client";

import { useEffect } from "react";
import Link from "next/link";

// Помилка всередині кореневого layout (сторінка, кабінет, плеєр): замість
// стандартного англомовного екрана Next — повідомлення своєю мовою і дві дії.
// retry — перезапит і повторний рендер (Next 16.2+); reset — старий варіант
// без перезапиту, лишено запасним.
type ErrorProps = {
  error: Error & { digest?: string };
  retry?: () => void;
  unstable_retry?: () => void;
  reset?: () => void;
};

export default function Error({ error, retry, unstable_retry, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const again = retry ?? unstable_retry ?? reset;

  return (
    <main className="sp-card" role="alert">
      {/* eslint-disable-next-line @next/next/no-img-element -- статичний значок із public, оптимізація зайва */}
      <img className="sp-logo" src="/icons/icon-192.png" alt="" width={56} height={56} />
      <h1 className="sp-title">Щось пішло не так</h1>
      <p className="sp-text">Сторінка не завантажилась. Спробуйте ще раз — найчастіше це тимчасова помилка зв’язку.</p>
      <div className="sp-actions">
        <button type="button" className="btn-primary-full" onClick={() => again?.()}>
          Спробувати ще раз
        </button>
        <Link href="/" className="btn-secondary-full">
          На головну
        </Link>
      </div>
      {error?.digest && <p className="sp-digest">Код помилки: {error.digest}</p>}
    </main>
  );
}
