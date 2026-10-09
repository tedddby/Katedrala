import type { Metadata } from "next";
import { CinematicHero } from "@/components/lab/cinematic/CinematicHero";
import { LabNav } from "@/components/lab/cinematic/LabNav";
import { ReadingNotes } from "@/components/lab/cinematic/ReadingNotes";

export const metadata: Metadata = {
  title: "Katedrala: see what your code stands on (lab, cinematic)",
  description:
    "Prototype hero: Katedrala's real analysis of CodeVerse, hung from its foundations like Gaudí's chain model, then turned over so the architecture stands.",
  robots: { index: false, follow: false },
};

export default function CinematicLabPage() {
  return (
    <>
      <LabNav />
      <main id="main">
        <CinematicHero />
        <ReadingNotes />
      </main>
    </>
  );
}
