import type { Metadata } from "next";
import { Fraunces, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import { SiteHeader } from "~/components/SiteHeader";

import "./globals.css";

// Editorial serifs with latin-ext → Czech diacritics render in every heading.
const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const body = Newsreader({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LegisNote — studium českého práva",
  description: "Čtení, anotace a navigace v české legislativě.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs" className={`${display.variable} ${body.variable}`}>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
