import { Button } from "@/components/ui/Button";
import { LINKS } from "@/lib/site";

/** The closing statement, set on the same hatched ground the page's drawings rest on. */
export function FinalCta() {
  return (
    <section id="get-started" aria-labelledby="get-started-title" className="section">
      <div className="frame">
        <div className="section-rule" />
        <h2 id="get-started-title" className="heading cta-title max-w-[22ch]">
          Understand your system before you change it.
        </h2>
        <p className="lede mt-7">
          Katedrala is open source and being built toward v1. Start with the README, follow the
          roadmap, or help build it.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button href={LINKS.readme}>
            Get started<span className="sr-only"> on GitHub</span>
          </Button>
          <Button href={LINKS.repository} variant="secondary">
            View on GitHub
          </Button>
        </div>
        <div aria-hidden="true" className="cta-ground ground-hatch" />
      </div>
    </section>
  );
}
