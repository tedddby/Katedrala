import { Button } from "@/components/ui/Button";
import { LINKS } from "@/lib/site";
import { HeroStage } from "./HeroDrawing";

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative pt-24 md:pt-28">
      <HeroStage
        copy={
          <>
            <h1 id="hero-title" className="display">
              See what holds your system&nbsp;up.
            </h1>
            <p className="lede mt-7">
              Katedrala reconstructs the architecture of TypeScript and JavaScript, with evidence
              for every&nbsp;dependency&nbsp;it&nbsp;finds.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button href="#how-it-works">Explore Katedrala</Button>
              <Button href={LINKS.repository} variant="secondary">
                View on GitHub
              </Button>
            </div>
          </>
        }
        titleBlock={
          <p className="title-block mt-3">
            <span>Demonstration system</span>
            <span>Line weight: load carried</span>
            <span>Gravity: draft method, planned for v1</span>
          </p>
        }
      />
    </section>
  );
}
