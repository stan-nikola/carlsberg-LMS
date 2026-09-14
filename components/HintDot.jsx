import { InfoIcon } from "@/components/icons";

/**
 * Іконка «ⓘ» з поясненням по ховеру — спільний елемент для будь-якого
 * місця, де підпис потрібен лише тому, хто спитав: що саме рахує
 * діаграма (кабінет керівника), що робить неочевидна кнопка (сертифікат
 * у картці курсу).
 *
 * Чому не нативний `title=`: там немає керування переносами й затримкою,
 * а текст тут — ціле речення. Бібліотеку заради підпису не тягнемо, тож
 * текст лежить у data-атрибуті й малюється через ::after (.hint-dot,
 * app/globals.css).
 *
 * tabIndex + role/aria-label — щоб підказка відкривалась і з клавіатури,
 * а не лише мишею; :focus-visible у CSS показує той самий блок.
 *
 * @param {string} text - пояснення
 * @param {"end"|"start"} [align] - до якого краю притискається блок
 *   підказки. "end" (дефолт) — іконка біля правого краю контейнера;
 *   "start", коли вона зліва й блок інакше вилазив би за екран.
 */
export function HintDot({ text, align = "end", className = "" }) {
  return (
    <span
      className={`hint-dot hint-dot-${align}${className ? ` ${className}` : ""}`}
      tabIndex={0}
      role="note"
      aria-label={text}
      data-hint={text}
    >
      <InfoIcon />
    </span>
  );
}
