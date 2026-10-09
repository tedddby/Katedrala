import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { FILM_MODE_SCRIPT } from "@/components/stage/mode";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const martian = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-martian",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Katedrala: the architecture inside your code",
  description:
    "Katedrala is an open-source engine that maps the dependency structure of TypeScript and JavaScript code, with the file and line behind every relationship. Boundaries, structural risk and change impact are planned for v1.",
};

export const viewport: Viewport = {
  themeColor: "#0e1012",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${martian.variable}`} suppressHydrationWarning>
      <head>
        {/* Lets the drawings wait for their settle animation; without JavaScript they show finished. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.js='1'" }} />
        {/* The film or its still drawing, decided before the first paint; a page without the film keeps no trace. */}
        <script dangerouslySetInnerHTML={{ __html: FILM_MODE_SCRIPT }} />
      </head>
      <body>
        {/*
          First in the tab order. "Skip the film" shows only on a page with the film and the plate after it
          (nav.css), and jumps there at once: the film treats [data-film-skip] links as jumps (stage/links.ts).
        */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <a href="#how-it-works" className="skip-link" data-skip="film" data-film-skip>
          Skip the film
        </a>
        {children}
      </body>
    </html>
  );
}
