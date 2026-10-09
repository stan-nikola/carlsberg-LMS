import type { ComponentType } from "react";
import * as Player from "@/components/CoursePlayer";
import * as Screens from "@/components/ScreenComponents";

// Екрани плеєра для прев'ю. CoursePlayer.jsx і ScreenComponents.jsx ще на JS:
// TS виводить із деструктуризації ВСІ їхні пропси обов'язковими, хоча прев'ю
// свідомо не передає onZoomImage/onGateProgress/номери питань (екрани мають
// для них запасну поведінку). Прибрати, коли ці файли перейдуть на TS.
type LooseScreen = ComponentType<any>;

export const ComponentScreen = Player.ComponentScreen as LooseScreen;
export const QuizScreen = Player.QuizScreen as LooseScreen;
export const CoursePlayer = Player.CoursePlayer as LooseScreen;
export const HotspotScreen = Screens.HotspotScreen as LooseScreen;
