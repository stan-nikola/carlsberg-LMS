// Здебільшого іконки з legacy index.html, винесені в окремі компоненти —
// inline SVG не змінювались, тільки перенесені з розмітки в JSX. Виняток —
// таббар HubShell (HomeIcon/LearnIcon/AchievementsIcon нижче): їх з того
// часу перемалювали на строгий лінійний стиль, див. коментар при TabSvg.

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

/** Нижній таббар (HubShell) — суворий контурний стиль (не "заливка
 * Instagram", як було раніше): та сама лінійна мова, що й решта іконок
 * проєкту (ClockIcon/CalendarIcon/ChevronIcon — fill:none, strokeWidth 2,
 * round caps/joins), а не окремий візуальний діалект лише для таббару.
 * Активний стан — трохи товща лінія (2.3 проти 1.8), не суцільна заливка:
 * разом із кольором (--cb-primary) і масштабом (.tab-btn.active svg у
 * hub.css) цього досить, щоб стан читався однозначно, без візуального
 * шуму заливки на маленькому розмірі. */
function TabSvg({ filled, children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.3 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// Один замкнений контур-п'ятикутник (дах+стіни одним штрихом) замість
// трьох окремих ліній — максимально зведена форма, той самий принцип
// строгого мінімалізму, що й зірка/шапка нижче.
export function HomeIcon({ filled = false }) {
  return (
    <TabSvg filled={filled}>
      <path d="M4 11 12 4 20 11V20H4Z" />
    </TabSvg>
  );
}

// Академічна шапка (ромб + стрічка-основа) — усталений символ навчання,
// впізнаваніший за книгу на маленькому розмірі таббару.
export function LearnIcon({ filled = false }) {
  return (
    <TabSvg filled={filled}>
      <path d="M12 4 22 9 12 14 2 9Z" />
      <path d="M6 11.5V17c0 1.5 2.8 3 6 3s6-1.5 6-3v-5.5" />
    </TabSvg>
  );
}

// П'ятикутна зірка одним замкненим контуром — той самий принцип, що
// HomeIcon вище, і зрозуміліший символ "досягнення", ніж кубок-трофей.
export function AchievementsIcon({ filled = false }) {
  return (
    <TabSvg filled={filled}>
      <path d="M12 3 14.6 8.6 20.7 9.4 16.2 13.6 17.4 19.7 12 16.9 6.6 19.7 7.8 13.6 3.3 9.4 9.4 8.6Z" />
    </TabSvg>
  );
}

// Коло-голова + плечі — компактний бюст, лінією.
export function ProfileIcon({ filled = false }) {
  return (
    <TabSvg filled={filled}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </TabSvg>
  );
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

/** Документ (currentColor — підхоплює колір батька) + ЧЕРВОНА печатка-
 * стрічка внизу (var(--danger), той самий токен, що й скрізь у проєкті
 * для акценту — не вигаданий hex): впізнаваний символ "сертифікат".
 * Єдиний компонент на весь проєкт — заміна кольору/форми тут одразу
 * поширюється на всі місця використання. */
export function CertificateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="6" y1="6.3" x2="18" y2="6.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="9.7" x2="14" y2="9.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M9.9 20.4 8.8 22.6 10.6 21.6 12 23.1 13.4 21.6 15.2 22.6 14.1 20.4"
        stroke="var(--danger, #f45f5e)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17.6" r="3" fill="var(--danger, #f45f5e)" />
      <circle cx="12" cy="17.6" r="1.3" fill="none" stroke="#fff" strokeWidth="0.9" />
    </svg>
  );
}
