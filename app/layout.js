import { Sora, Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "@/app/styles/registration.css";
import "@/app/styles/hub.css";
import "@/app/styles/course-player.css";
import "@/app/styles/admin.css";

// Три шрифти, які legacy тягнув через <link> на fonts.googleapis.com —
// next/font сам їх самохостить (без зовнішнього запиту в браузері) і
// віддає CSS-змінні, підключені нижче до токенів --font-display/body/mono
// у app/globals.css (це колишній css/base.css).
const sora = Sora({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-sora",
});
const sourceSans3 = Source_Sans_3({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-source-sans-3",
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

export const metadata = {
  title: "Платформа адаптації Carlsberg",
  description: "Платформа адаптації Carlsberg Ukraine",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0E6B4C",
  colorScheme: "light",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="uk"
      className={`${sora.variable} ${sourceSans3.variable} ${ibmPlexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
