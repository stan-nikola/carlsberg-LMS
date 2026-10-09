"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronIcon } from "@/components/ui/icons";
import { peekScrollTo, scrollToEnd } from "@/lib/scrollHints";
import { renderRichText, renderRichMarks } from "@/lib/richText";
import { Kicker, ScreenMedia } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type ScreenProps } from "@/components/course/screens/types";

/* ===================== ACCORDION ===================== */

export function AccordionScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }: ScreenProps) {
  const { kicker, lead, images = [], items = [] } = component.content || EMPTY_CONTENT;
  // Відкрита картка більше НЕ закривається — ні кліком по ній, ні
  // відкриттям сусідньої. Раніше відкритою могла бути лише одна, і щоб
  // порівняти дві картки, доводилось перемикатись туди-сюди по пам'яті.
  // Тепер прочитане лишається перед очима. Той самий стан і для гейта:
  // «відкрито» = «зараховано».
  const [everOpened, setEverOpened] = useState(() => new Set<number>());

  useEffect(() => {
    onGateProgress?.(everOpened.size);
  }, [everOpened, onGateProgress]);

  const listRef = useRef<HTMLDivElement>(null);
  // Наступна ще не відкрита картка — саме її підсвічуємо переливом.
  // У методичці все відкрито з самого початку — підсвічувати нічого.
  const isOpen = (i: number) => readOnly || everOpened.has(i);
  const nextIdx = readOnly || !tapHint ? -1 : items.findIndex((_, i) => !everOpened.has(i));

  function toggle(i: number) {
    if (readOnly || everOpened.has(i)) return;
    setEverOpened((prev) => new Set(prev).add(i));
    // Підводимо картку, що йде ЗА цією, а не «першу невідкриту»: людина
    // читає згори вниз, і стрибок назад збивав би. peekScrollTo лишає
    // щойно відкритий текст на екрані — саме тому, що scrollIntoView
    // ховав його під верхній край.
    // keepVisible — сама відкрита картка: на десктопі список у два
    // стовпці, «наступна» стоїть у тому ж ряду, і без цього розкритий
    // текст обрізало нижнім краєм в'юпорта.
    // Остання картка: наступної нема — крутимо до самого низу, щоб було
    // видно і її текст, і те, що стоїть під списком (підказка гейта,
    // наступний компонент).
    const children = listRef.current?.children;
    const following = children?.[i + 1];
    const opened = children?.[i];
    requestAnimationFrame(() => (following ? peekScrollTo(following, { keepVisible: opened }) : scrollToEnd(opened)));
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="acc-list" ref={listRef}>
        {items.map((item, i) => (
          <div key={i} className={`acc-item${isOpen(i) ? " open seen" : ""}`}>
            {/* У методичці заголовок — не кнопка: нічого не розгортати. */}
            {readOnly ? (
              <div className="acc-head acc-head--static">
                <span className="acc-title">{renderRichMarks(item.title) || `Картка ${i + 1}`}</span>
              </div>
            ) : (
              <button
                type="button"
                className={`acc-head${i === nextIdx ? " tap-next" : ""}`}
                onClick={() => toggle(i)}
                aria-expanded={everOpened.has(i)}
              >
                <span className="acc-title">{renderRichMarks(item.title) || `Картка ${i + 1}`}</span>
                <span className="acc-chevron">
                  <ChevronIcon />
                </span>
              </button>
            )}
            {isOpen(i) && <div className="acc-body">{renderRichText(item.body)}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
