import { LINKS } from "@/lib/site";
import { Wordmark } from "./Wordmark";

const COLUMNS = [
  {
    title: "Project",
    links: [
      { label: "GitHub", href: LINKS.repository },
      { label: "Roadmap", href: LINKS.roadmap },
      { label: "Contributing", href: LINKS.contributing },
      { label: "MIT license", href: LINKS.license },
    ],
  },
  {
    title: "Documentation",
    links: [
      { label: "Architecture document", href: LINKS.architecture },
      { label: "The IR contract", href: LINKS.ir },
      { label: "All documents", href: LINKS.documentation },
    ],
  },
  {
    title: "Related",
    links: [{ label: "CodeVerse", href: LINKS.codeverse }],
  },
] as const;

export function Footer() {
  return (
    <footer className="mt-32 border-t border-rule">
      <div className="frame grid-12 gap-y-10 py-14">
        <div className="col-span-12 md:col-span-4">
          <Wordmark />
          <p className="mt-4 max-w-xs text-[0.9375rem] text-ink-faint">
            An open-source software architecture engine. MIT licensed.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="col-span-6 md:col-span-2">
            <h2 className="text-[0.875rem] font-semibold text-ink">{column.title}</h2>
            <ul className="mt-2 text-[0.9375rem] text-ink-faint">
              {column.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    rel="noopener"
                    className="inline-block py-2.5 transition-colors duration-150 hover:text-ink pointer-fine:py-1"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
