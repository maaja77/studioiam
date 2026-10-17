import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kartotéka klientů",
  description: "Soukromá kartotéka klientů kosmetického salonu. Kontakty, návštěvy a poznámky o ošetření.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body className="antialiased">{children}</body>
    </html>
  );
}
