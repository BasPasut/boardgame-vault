import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-gothic",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BoardgameVault — Play Your Favorite Board Games Online",
  description: "Turn your physical board games into online sessions. Play Shadows Over Thornwick and more with friends anywhere.",
  openGraph: {
    title: "BoardgameVault",
    description: "Your physical board games, now online.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased bg-vault-navy">
        {children}
      </body>
    </html>
  );
}
