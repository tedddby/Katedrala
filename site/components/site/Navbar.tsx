import { LINKS } from "@/lib/site";
import { Button } from "@/components/ui/Button";
import { MenuDisclosure } from "./MenuDisclosure";
import { Wordmark } from "./Wordmark";

const ITEMS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Architecture", href: "#architecture" },
  { label: "Concepts", href: "#gravity" },
  { label: "Developers", href: "#developers" },
] as const;

/**
 * One line, 64px. As the page scrolls it gains a sheet background and a bottom rule (CSS scroll-driven
 * animation; browsers without it keep the solid variant). Below lg the same links sit in a disclosure menu.
 */
export function Navbar() {
  return (
    <header className="site-nav fixed inset-x-0 top-0 z-(--z-nav)">
      <div className="frame flex h-16 items-center justify-between gap-6">
        <a href="#top" className="-m-2 p-2" aria-label="Katedrala, back to top">
          <Wordmark />
        </a>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-8 text-[0.9375rem] text-ink-soft">
            {ITEMS.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="nav-link">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a href={LINKS.repository} className="nav-link" rel="noopener">
                GitHub
              </a>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <Button href={LINKS.readme} size="sm">
              Get started<span className="sr-only"> on GitHub</span>
            </Button>
          </div>
          <MenuDisclosure items={ITEMS} />
        </div>
      </div>
    </header>
  );
}
