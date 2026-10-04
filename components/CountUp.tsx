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
const OPACITY_TIMING = { duration: 90, easing: "ease-out" };

export function CountUp({
  to,
  from,
  max,
  up = false,
  delayMs = 0,
  prefix,
  locales = "uk-UA",
}: {
  to: number;
  from?: number;
  max?: number;
  /** Рахувати вгору від трохи меншого числа (бали), а не вниз від гіршого місця. */
  up?: boolean;
  delayMs?: number;
  prefix?: string;
  locales?: Intl.LocalesArgument;
}) {
  const start = from ?? (up ? Math.max(0, to - Math.max(9, Math.round(to * 0.01))) : Math.min(to + Math.max(9, Math.round(to * 0.95)), max ?? Infinity));
  const [state, setState] = useState({ value: to, animated: false });

  useEffect(() => {
    if (start === to) return undefined;
    let raf = 0;
    let timer = 0;
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
    };
  }, [to, start, delayMs]);

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
