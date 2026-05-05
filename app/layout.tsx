import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoomBooker",
  description: "Auto-book physical meeting rooms when meetings are created in Google Calendar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
