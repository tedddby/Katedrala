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

/**
 * The page's last drawing convention: its title block. Under the ground the final statement stands on, the
 * project and its links sit in cells divided by hairlines, as the title block of a drawing sheet does.
 */
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="frame">
        <div className="footer-block">
          <div className="footer-cell footer-mark">
            <Wordmark />
            <p className="mt-4 max-w-xs text-[0.9375rem] text-ink-faint">
              An open-source software architecture engine.{" "}
              <span className="footer-license">MIT licensed.</span>
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="footer-cell">
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
      </div>
    </footer>
  );
}
