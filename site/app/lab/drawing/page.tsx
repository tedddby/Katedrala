import type { Metadata } from "next";
import { HangingHero } from "@/components/lab/drawing/HangingHero";
import { Navbar } from "@/components/site/Navbar";

export const metadata: Metadata = {
  title: "Lab: the hanging model | Katedrala",
  description:
    "Prototype hero: Katedrala's real structure analysis of CodeVerse, hung from its foundations like Gaudí's chain models, then turned over.",
  robots: { index: false, follow: false },
};

/** Lab route: the hanging-model hero at the top of a page, followed by where the page would continue. */
export default function DrawingLabPage() {
  return (
    <>
      <Navbar />
      <main id="main">
        <HangingHero />
        <section
          aria-label="Continuation"
          className="frame flex min-h-[60svh] items-center border-t border-rule"
        >
          <p className="data text-ink-faint">The page continues here with How it works.</p>
        </section>
      </main>
    </>
  );
}
