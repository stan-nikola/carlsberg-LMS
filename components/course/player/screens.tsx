"use client";

import { renderRichText, renderRichMarks } from "@/lib/richText";
import { OrderingScreen, MatchingScreen } from "@/components/course/QuestionScreens";
import { AccordionScreen } from "@/components/course/screens/AccordionScreen";
import { ChecklistScreen } from "@/components/course/screens/ChecklistScreen";
import { ScriptScreen } from "@/components/course/screens/ScriptScreen";
import { TimelineScreen } from "@/components/course/screens/TimelineScreen";
import { ImagePinsScreen } from "@/components/course/screens/ImagePinsScreen";
import { BeforeAfterScreen } from "@/components/course/screens/BeforeAfterScreen";
import { PhotoScreen } from "@/components/course/screens/PhotoScreen";
import { InputScreen } from "@/components/course/screens/InputScreen";
import { NoteAccordion, PhotoFrame } from "@/components/course/screens/media";
import { HotspotScreen } from "@/components/course/screens/HotspotScreen";
import { QuizScreen } from "@/components/course/player/QuizScreen";
import type { ComponentType, CSSProperties, Ref } from "react";
import { EMPTY_CONTENT, type PlayerComponent, type QuestionScreenProps, type ScreenProps, type ZoomImage } from "@/components/course/screens/types";
import type { Answers } from "@/components/course/player/types";
import type { AnswerState } from "@/lib/grading";

/**
 * Диспетчер КОМПОНЕНТІВ (не екранів — один екран тепер може мати кілька):
 * за Component.type віддає потрібний фрагмент розмітки, БЕЗ власної
 * обгортки .cp-screen — весь стек компонентів одного екрана огортає
 * ОДНИМ .cp-screen батько (ScreenBody нижче). Той самий диспетчер і в
 * плеєрі, і в прев'ю /admin — щоб адміністратор бачив рівно те, що
 * побачить співробітник.
 */
const SCREEN_BY_TYPE: Record<string, ComponentType<ScreenProps>> = {
  accordion: AccordionScreen,
  checklist: ChecklistScreen,
  script: ScriptScreen,
  timeline: TimelineScreen,
  imagepins: ImagePinsScreen,
  beforeafter: BeforeAfterScreen,
  photo: PhotoScreen,
  input: InputScreen,
};

export function ComponentScreen(props: ScreenProps) {
  // onZoomImage потрібен КОЖНОМУ типу: фото можна додати до будь-якого
  // компонента. readOnly — «методичка» (components/course/CourseReview.jsx):
  // усе розкрито, без гейтів, тапів і підсвітки наступного кроку. tapHint —
  // перелив «тапни сюди»; плеєр вмикає його лише для першого непройденого
  // гейта екрана. Невідомий тип — інфо-блок.
  const Screen = SCREEN_BY_TYPE[props.component.type ?? ""] ?? InfoScreen;
  return <Screen {...props} />;
}

// Експортуються також для живого прев'ю в /admin (components/course-editor/preview.tsx) —
// той самий рендер, що бачить співробітник у плеєрі, не окрема копія розмітки.
export function InfoScreen({ component, screenNumber, onZoomImage }: ScreenProps) {
  const { kicker, lead, body, images, note } = component.content || EMPTY_CONTENT;
  // Без картинок з URL — не пустий масив, а взагалі відсутність .cp-info-media
  // в DOM (щоб CSS-селектор :has(+ .cp-info-text) у @container-reflow,
  // course-player.css, коректно бачив "нема сусіда зліва" і не ділив
  // порожню колонку навпіл).
  const validImages = images?.filter((img) => img.url) || []; // без фільтра
  // next/image кидає варнінг на порожній src — трапляється, коли в /admin
  // додали слот під фото, але ще не встигли завантажити файл/вписати URL.
  const hasMedia = validImages.length > 0;
  const zoomable = typeof onZoomImage === "function";

  const mediaNode = hasMedia && (
    <div className="cp-info-media">
      {validImages.map((img, i) => {
        const alt = img.caption || component.title || "";
        // Фото клікабельне лише там, де плеєр дав куди його відкрити
        // (onZoomImage) — у статичних контекстах лишається звичайним.
        return (
          <PhotoFrame key={i} src={img.url} alt={alt} onZoom={zoomable ? onZoomImage : undefined}>
            {img.caption && <div className="cp-photo-caption">{img.caption}</div>}
          </PhotoFrame>
        );
      })}
    </div>
  );

  const textNode = (body || note) && (
    <div className="cp-info-text">
      {body && <div className="cp-body">{renderRichText(body)}</div>}
      {note && <NoteAccordion note={note} />}
    </div>
  );

  return (
    <>
      {kicker && (
        <div className="cp-kicker">
          <span className="cp-kicker-num">{screenNumber}</span>
          <span>{kicker}</span>
        </div>
      )}
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      {mediaNode}
      {textNode}
    </>
  );
}

/**
 * Один компонент у стеку екрана — маршрутизує quiz окремо (потребує
 * answer/onAnswer, не onGateProgress) від решти типів, і огортає кожен у
 * .screen-component (візуальний роздільник між сусідніми компонентами
 * одного екрана — див. course-player.css).
 */
const QUESTION_BY_TYPE: Record<string, ComponentType<QuestionScreenProps>> = {
  quiz: QuizScreen,
  ordering: OrderingScreen,
  matching: MatchingScreen,
  hotspot: HotspotScreen,
};

export function ScreenComponentBlock({
  component,
  screenNumber,
  answers,
  onQuizAnswer,
  onGateProgress,
  onZoomImage,
  blockRef,
  nextComponentId,
  tapHint = true,
  questionNumber,
  questionTotal,
  staggerIndex = 0,
}: {
  component: PlayerComponent;
  screenNumber: number;
  answers: Answers;
  onQuizAnswer: (componentId: PlayerComponent["id"], answer: AnswerState) => void;
  onGateProgress: (componentId: PlayerComponent["id"], done: number) => void;
  onZoomImage?: ZoomImage;
  blockRef?: Ref<HTMLDivElement>;
  nextComponentId?: PlayerComponent["id"] | null;
  tapHint?: boolean;
  questionNumber?: number;
  questionTotal?: number;
  staggerIndex?: number;
}) {
  // Каскадна поява карток одного екрана: кожен наступний .screen-component
  // з'являється трохи пізніше (course-player.css). Кап на 5 — інакше на
  // екрані з десятком компонентів останній довелось би чекати.
  const cascadeStyle = { "--stagger-i": Math.min(staggerIndex, 5) } as CSSProperties;
  const Question = QUESTION_BY_TYPE[component.type ?? ""];
  return (
    <div className="screen-component" ref={blockRef} data-next-component={nextComponentId ?? undefined} style={cascadeStyle}>
      {Question ? (
        <Question
          component={component}
          screenNumber={screenNumber}
          answer={answers[component.id]}
          onAnswer={(answer) => onQuizAnswer(component.id, answer)}
          onZoomImage={onZoomImage}
          questionNumber={questionNumber}
          questionTotal={questionTotal}
        />
      ) : (
        <ComponentScreen
          component={component}
          screenNumber={screenNumber}
          onGateProgress={(done) => onGateProgress(component.id, done)}
          onZoomImage={onZoomImage}
          tapHint={tapHint}
        />
      )}
    </div>
  );
}
