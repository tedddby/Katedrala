import type { Metadata } from "next";
import { Navbar } from "@/components/site/Navbar";
import { Film } from "@/components/stage/Film";
import { Legend } from "@/components/stage/Legend";
import { FILM_MODE_SCRIPT } from "@/components/stage/mode";

export const metadata: Metadata = {
  title: "Katedrala: see what your code stands on (preview)",
  description:
    "Preview of the film that opens the Katedrala page: Katedrala's real analysis of CodeVerse, hung from its foundations like Gaudí's chain model, then turned over so the architecture stands.",
  robots: { index: false, follow: false },
};

/**
 * The film's preview route until it opens the main page: the promoted film (components/stage) under the site's
 * navigation, then the drawing's legend, which the landing will carry.
 */
export default function CinematicLabPage() {
  return (
    <>
      {/* Decides film or still before anything paints. The main page's layout carries it in <head>; a second copy
          does nothing. */}
      <script dangerouslySetInnerHTML={{ __html: FILM_MODE_SCRIPT }} />
      <a href="#film-end" className="skip-link" data-film-skip>
        Skip the film
      </a>
      <Navbar />
      <main id="main">
        <Film />
        <section aria-label="The drawing's legend" className="border-t border-rule py-20">
          <div className="frame">
            <Legend />
          </div>
        </section>
      </main>
    </>
  );
}
