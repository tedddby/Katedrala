import { LINKS } from "@/lib/site";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "./Wordmark";

const ITEMS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Architecture", href: "#architecture" },
  { label: "Concepts", href: "#gravity" },
  { label: "Developers", href: "#developers" },
] as const;

/**
 * One line, 64px. As the page scrolls it gains a sheet background and a bottom rule (CSS scroll-driven
 * animation; browsers without it keep the solid variant). Small screens use a native disclosure.
 */
export function Navbar() {
  return (
    <header className="site-nav fixed inset-x-0 top-0 z-40">
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
              Get started
            </Button>
          </div>
          <details className="nav-menu relative lg:hidden">
            <summary className="flex h-9 cursor-pointer list-none items-center border border-rule-strong px-3.5 text-[0.875rem] font-semibold">
              Menu
            </summary>
            <div className="absolute right-0 top-11 w-56 border border-rule-strong bg-sheet-raised p-2">
              <ul className="flex flex-col">
                {ITEMS.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="block px-3 py-2.5 text-ink-soft hover:bg-sheet hover:text-ink"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href={LINKS.repository}
                    rel="noopener"
                    className="block px-3 py-2.5 text-ink-soft hover:bg-sheet hover:text-ink"
                  >
                    GitHub
                  </a>
                </li>
                <li className="mt-1 border-t border-rule pt-1 sm:hidden">
                  <a
                    href={LINKS.readme}
                    rel="noopener"
                    className="block px-3 py-2.5 font-semibold text-ink"
                  >
                    Get started
                  </a>
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
