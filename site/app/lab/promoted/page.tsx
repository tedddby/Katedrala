import type { Metadata } from "next";
import { Suspense } from "react";
import { Architecture } from "@/components/sections/Architecture";
import { Developers } from "@/components/sections/Developers";
import { Ecosystem } from "@/components/sections/Ecosystem";
import { Entropy } from "@/components/sections/Entropy";
import { FinalCta } from "@/components/sections/FinalCta";
import { Gravity } from "@/components/sections/Gravity";
import { History } from "@/components/sections/History";
import { OpenSource } from "@/components/sections/OpenSource";
import { Pipeline } from "@/components/sections/Pipeline";
import { Rules } from "@/components/sections/Rules";
import { Footer } from "@/components/site/Footer";
import { Navbar } from "@/components/site/Navbar";
import { Film } from "@/components/stage/Film";

export const metadata: Metadata = {
  title: "Katedrala: the promoted page (preview)",
  description:
    "Preview of the Katedrala page with the film at its top, before it replaces the main page. Deleted with the lab.",
  robots: { index: false, follow: false },
};

/**
 * The main page as the switch composes it (promotion plan 3.4), previewed here until it replaces app/page.tsx;
 * then this route goes with the rest of the lab. The film opens the page and is its one authored moment: Katedrala's
 * real analysis of CodeVerse in three acts and a landing. The hinge plate turns from that real output to the
 * demonstration system, and the plates after it preview v1 in the film's drawing language, every capability with
 * its status. The layout's "Skip the film" link shows here, the one page with both the film and the hinge plate.
 *
 * Each plate after the film is its own Suspense boundary. Nothing in them suspends: they are rendered on the server
 * as before and no fallback ever shows. The boundaries let the film's island hydrate and start before the plates'
 * islands do (each boundary hydrates in its own pass), so the plates never hold up the film's first frame.
 */
export default function PromotedPage() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Film />
        <Suspense>
          <Pipeline />
        </Suspense>
        <Suspense>
          <Architecture />
        </Suspense>
        <Suspense>
          <Gravity />
        </Suspense>
        <Suspense>
          <Entropy />
        </Suspense>
        <Suspense>
          <History />
        </Suspense>
        <Suspense>
          <Rules />
        </Suspense>
        <Suspense>
          <Developers />
        </Suspense>
        <Suspense>
          <OpenSource />
        </Suspense>
        <Suspense>
          <Ecosystem />
        </Suspense>
        <Suspense>
          <FinalCta />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
