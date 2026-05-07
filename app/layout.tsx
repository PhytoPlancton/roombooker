import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/ThemeProvider";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], variable: "--font-instrument" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

const SITE_URL = "https://roombooker.nmt.ovh";
const PITCH = "Une salle physique réservée à chaque meeting Google Calendar. Plus jamais de double saisie entre Google Cal et Skedda — tu poses ton meeting, on s'occupe de la salle.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Roombooker — Une salle, à chaque meeting Google Cal.",
  description: PITCH,
  openGraph: {
    title: "Roombooker — Une salle, à chaque meeting Google Cal.",
    description: PITCH,
    url: SITE_URL,
    siteName: "Roombooker",
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Roombooker — Une salle, à chaque meeting Google Cal.",
    description: PITCH,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="joyful" data-mode="light" className={`${inter.variable} ${instrumentSerif.variable} ${jetbrains.variable}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
