// Іконки з legacy index.html, винесені в окремі компоненти — самі inline
// SVG не змінювались, тільки перенесені з розмітки в JSX.

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

/** Нижній таббар (HubShell) — у стилі Instagram: контурна іконка неактивної
 * вкладки, суцільно залита — активної. Кожна іконка тут — ОДИН і той самий
 * `d` для обох станів (просто перемикаємо fill↔stroke), щоб при заливці
 * форма контуру не "стрибала" на інший силует, як було з попереднім
 * набором (окремі path для outline/filled малювались незалежно і не
 * збігались один з одним). */
function TabSvg({ d, filled }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d={d} fillRule="evenodd" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} fillRule="evenodd" />
    </svg>
  );
}

// Будиночок з навісом даху (дах ширший за стіни) і дверима-"вирізом" —
// навіть в залитому стані читається однозначно як дім, а не просто
// п'ятикутник (fillRule="evenodd" робить прямокутник дверей "діркою").
const HOME_PATH = "M12 2 22 11 19 11 19 21 5 21 5 11 2 11Z M10 21 10 14 14 14 14 21Z";
export function HomeIcon({ filled = false }) {
  return <TabSvg d={HOME_PATH} filled={filled} />;
}

// Закрита книга з чітким "корінцем" — вертикальна лінія-виріз біля
// заокругленого краю відділяє обкладинку від сторінок, тож форма
// однозначно читається як книга, а не закладка чи картка.
const LEARN_PATH = "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z M7.6 4 7.6 20 8.4 20 8.4 4Z";
export function LearnIcon({ filled = false }) {
  return <TabSvg d={LEARN_PATH} filled={filled} />;
}

// Кубок-трофей: чаша на ніжці й підставці + дві "ручки" по боках
// (окремі замкнені підшляхи), щоб форма однозначно читалась як трофей,
// а не абстрактна фігура.
const ACHIEVEMENTS_PATH =
  "M6 3h12v6a6 6 0 0 1-5 5.92V17h2.5a1 1 0 0 1 1 1v2H7.5v-2a1 1 0 0 1 1-1H11v-2.08A6 6 0 0 1 6 9Z M6 4.5C2.5 4.8.8 6.8.8 8.5S2.5 12.2 6 12.5C4 12 3 10.5 3 8.5S4 5 6 4.5Z M18 4.5C21.5 4.8 23.2 6.8 23.2 8.5S21.5 12.2 18 12.5C20 12 21 10.5 21 8.5S20 5 18 4.5Z";
export function AchievementsIcon({ filled = false }) {
  return <TabSvg d={ACHIEVEMENTS_PATH} filled={filled} />;
}

// Коло-голова + плечі — компактний бюст, як в іконці профілю Instagram.
const PROFILE_PATH =
  "M12 3.3a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 1 0 0-8.6Z M4.2 21a7.8 7.8 0 0 1 15.6 0 1 1 0 0 1-1 1H5.2a1 1 0 0 1-1-1Z";
export function ProfileIcon({ filled = false }) {
  return <TabSvg d={PROFILE_PATH} filled={filled} />;
}

/** Кружечок завантаження для кнопок дій (Зберегти/Призначити/Створити
 * тощо) — colorами не переймається, бере currentColor від батька
 * (див. .admin-spinner в admin.css: колір/розмір/анімація). */
export function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="admin-spinner">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="34 100" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CourseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function SettingsGearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
  );
}

export function WelcomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

export function MerchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

export function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** Ручка для drag-and-drop перетягування (/admin) — шість крапок, стандартний
 * "grip" візуал. SVG замість символу Brailleю (⠿), той не у всіх шрифтах
 * має гліф і міг взагалі не бути видимим. */
export function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

/** "ⓘ" — підказка по ховеру/фокусу (напр. .admin-info-tip), коли довге
 * пояснення краще ховати за іконкою, а не тримати завжди розгорнутим
 * текстом під контролом. */
export function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Годинник — для "час проходження" (EnrollmentAttempt.durationSeconds) у
 * кабінеті керівника (components/ManagerDashboard.jsx). */
export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

/** Календар — для дат призначення/завершення в кабінеті керівника. */
export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

/** Стовпчиковий графік — заголовок блоку "% виконання по курсу" в
 * кабінеті керівника. */
export function TrendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V10M11 21V5M18 21v-7" />
      <path d="M3 21h18" />
    </svg>
  );
}

/** Кегля для боулінгу — "страйк" (streak) курсу телесейлінгу, гра слів
 * страйк-рейт/страйк у боулінгу. Для конфігурації мотиваційних тостів
 * (Course.streakMessages.icon) поруч із наявними emoji-іконками. Суцільна
 * заливка (не тонкий 1.8px контур) — тонкі лінії губились у locked-стані
 * бейджа (grayscale+opacity:0.6, components/AchievementsPanel.jsx), суцільний
 * силует лишається впізнаваним навіть притлумленим. */
export function BowlingPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.2c-1.05 0-1.9.85-1.9 1.9 0 .55.24 1.04.6 1.39-1.1 1.6-1.7 3.5-1.7 5.31 0 1.55-1.4 3.9-1.4 6.1C7.6 19.6 9.5 21.8 12 21.8s4.4-2.2 4.4-4.9c0-2.2-1.4-4.55-1.4-6.1 0-1.81-.6-3.71-1.7-5.31.36-.35.6-.84.6-1.39 0-1.05-.85-1.9-1.9-1.9Z" />
    </svg>
  );
}

const MEDAL_COLORS = {
  gold: "var(--gold, #b49132)",
  silver: "#9aa4ab",
  bronze: "#b3703a",
};

/** Маленька медалька для топ-3 рейтингу регіону (components/AchievementsPanel.jsx)
 * — колір передає ранг напряму (не тема), тому фіксовані кольори, не currentColor. */
export function MedalIcon({ tier = "gold" }) {
  const color = MEDAL_COLORS[tier] || MEDAL_COLORS.gold;
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M9 3h6v4.2L12 11 9 7.2Z" fill={color} opacity="0.55" />
      <circle cx="12" cy="14.5" r="6.2" fill={color} />
      <circle cx="12" cy="14.5" r="6.2" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
      <circle cx="12" cy="14.5" r="3.4" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" />
    </svg>
  );
}

/** Документ + медальйон-стрічка внизу — впізнаваний символ "сертифікат",
 * той самий stroke-стиль, що й решта іконок (не MedalIcon-подібний
 * suddenly-fill варіант — тут це кнопка дії, не декоративна нагорода). */
export function CertificateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="19" height="13" rx="2" />
      <line x1="6" y1="6.5" x2="18" y2="6.5" />
      <line x1="6" y1="10" x2="14" y2="10" />
      <circle cx="12" cy="18.3" r="2.7" />
      <path d="M9.9 20.6 8.8 22.7 10.6 21.7 12 23.2 13.4 21.7 15.2 22.7 14.1 20.6" />
    </svg>
  );
}
