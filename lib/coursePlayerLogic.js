/**
 * Чиста логіка плеєра курсу, винесена з components/CoursePlayer.jsx —
 * щоб її можна було перевірити тестом. У самому плеєрі вона жила
 * всередині React-компонента, а тестового середовища для компонентів у
 * проєкті немає (vitest.config.mjs: environment "node", без jsdom/RTL),
 * тож будь-яка помилка тут ловилась би лише очима.
 */

/**
 * Наскрізна нумерація КОМПОНЕНТІВ по всьому курсу: 1, 2, 3…
 *
 * Раніше в кикері стояв номер ЕКРАНА, і два питання на одному екрані
 * обидва показували «1» — людина не розуміла, скільки вже пройшла.
 * Нумерація йде в порядку екранів, а всередині екрана — в порядку
 * компонентів, тобто рівно так, як людина їх бачить.
 *
 * @param {{components?: {id:number}[]}[]} screens
 * @returns {Map<number, number>} id компонента -> його номер (з 1)
 */
export function numberComponents(screens) {
  const numbers = new Map();
  let n = 0;
  (screens || []).forEach((screen) => {
    (screen.components || []).forEach((component) => {
      n += 1;
      numbers.set(component.id, n);
    });
  });
  return numbers;
}

/**
 * Який крок таймлайна підсвітити як «наступний тап» (.tap-next).
 *
 * Два режими таймлайна дають РІЗНУ відповідь, і саме тому логіка окремо:
 * - без highlight — гейт вимагає відкрити всі кроки, підказка веде по
 *   порядку: перший ще не відкритий;
 * - з highlight («ви тут») — гейт зараховує ЛИШЕ підсвічений крок, решта
 *   необов'язкові. Підказка на першому кроці тут брехала б: людина тапає,
 *   куди кличе перелив, а «Далі» не вмикається. Тому підсвічуємо тільки
 *   підсвічений крок, і лише поки його не відкрили.
 *
 * @param {number} stepCount
 * @param {Set<number>} everOpened індекси вже відкритих (хоч раз) кроків
 * @param {number|null} highlightIdx індекс кроку «ви тут» або null
 * @returns {number} індекс кроку або -1, якщо підсвічувати нічого
 */
export function nextTimelineTarget(stepCount, everOpened, highlightIdx) {
  if (highlightIdx != null) {
    return highlightIdx < stepCount && !everOpened.has(highlightIdx) ? highlightIdx : -1;
  }
  for (let i = 0; i < stepCount; i += 1) {
    if (!everOpened.has(i)) return i;
  }
  return -1;
}

/**
 * Фішер-Йейтс на КОПІЇ — вихідний масив не чіпаємо: він приходить прямо
 * з component.content, і перемішування на місці зіпсувало б збережений
 * контент курсу при першому ж показі.
 *
 * @param {T[]} items
 * @returns {T[]}
 * @template T
 */
export function shuffleArray(items) {
  const next = [...(items || [])];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
