"use client";

import NumberFlow, { continuous } from "@number-flow/react";
import { useEffect, useState } from "react";

/**
 * Число-«одометр» на number-flow (рішення користувача 2026-10-04: власний
 * CSS-барабан смикався й застрягав нижче базової лінії). Бібліотека сама
 * малює рамки цифр, маску по краях і крутить через усі проміжні цифри
 * (plugins: continuous). Рух — 2070 мс, крива «розгін-гальмування» без
 * перельоту (підібрано користувачем на стенді Motion Tuner, 2026-10-04). Напрямок — природний: зростання
 * (бали) котиться знизу вгору, спадання (місце «№ 6 → 1») — згори вниз.
 *
 * Старт: `from`, або для місця — помітно гірше місце (`to + max(9, 95%)`,
 * не далі за `max` — стенд Motion Tuner, 2026-10-04), або `up` — трохи
 * менше число. На сервері й у першому
 * кадрі — одразу кінцеве значення (SSR без розбіжностей, number-flow не
 * анімує перший рендер); далі один кадр без анімації на старт і рух до
 * свого. «Зменшити рух» бібліотека поважає сама (respectMotionPreference).
 */
const TIMING = { duration: 2010, easing: "cubic-bezier(0.5, 0, 0.4, 1)" };
/**
 * Ключі, чия анімація вже відіграла в цьому завантаженні сторінки (користувач,
 * 2026-10-05: «один раз при перезавантаженні чи вході, а не при кожному переході
 * зі сторінки на сторінку»). Модульна змінна: переживає SPA-навігацію, F5 обнуляє.
 */
const playedKeys = new Set<string>();
const OPACITY_TIMING = { duration: 90, easing: "ease-out" };

export function CountUp({
  to,
  from,
  max,
  up = false,
  delayMs = 0,
  prefix,
  locales = "uk-UA",
  playKey,
}: {
  to: number;
  from?: number;
  max?: number;
  /** Рахувати вгору від трохи меншого числа (бали), а не вниз від гіршого місця. */
  up?: boolean;
  delayMs?: number;
  prefix?: string;
  locales?: Intl.LocalesArgument;
  /** Якщо задано — число крутиться лише при ПЕРШОМУ показі за завантаження сторінки; далі одразу кінцеве. */
  playKey?: string;
}) {
  const already = playKey ? playedKeys.has(playKey) : false;
  const start = already ? to : from ?? (up ? Math.max(0, to - Math.max(9, Math.round(to * 0.01))) : Math.min(to + Math.max(1, Math.round(to * 3)), max ?? Infinity));
  const [state, setState] = useState({ value: to, animated: false });

  useEffect(() => {
    if (start === to) return undefined;
    let raf = 0;
    let timer = 0;
    // Відмічаємо «зіграло» вже ПІСЛЯ повного ходу: якщо пішли зі сторінки раніше —
    // чистимо таймер і наступного разу число знову крутиться.
    const mark = playKey ? window.setTimeout(() => playedKeys.add(playKey), TIMING.duration + delayMs + 200) : 0;
    // updateProperties() обгортки виставляє `animated` ДО зміни даних, тож
    // «старт без анімації» і «рух до свого» — два звичайні рендери.
    raf = requestAnimationFrame(() => {
      setState({ value: start, animated: false });
      timer = window.setTimeout(() => {
        raf = requestAnimationFrame(() => setState({ value: to, animated: true }));
      }, delayMs);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(mark);
    };
  }, [to, start, delayMs, playKey]);

  return (
    <NumberFlow
      value={state.value}
      animated={state.animated}
      plugins={[continuous]}
      spinTiming={TIMING}
      transformTiming={TIMING}
      opacityTiming={OPACITY_TIMING}
      locales={locales}
      prefix={prefix}
    />
  );
}
