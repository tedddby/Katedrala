"use client";

import { useEffect, useRef } from "react";
import { LINKS } from "@/lib/site";

/**
 * The small-screen menu: a native disclosure inside its own navigation landmark. It closes when a link is
 * chosen, on Escape (focus returns to the toggle), on a press anywhere outside it and when Tab leaves it.
 */
export function MenuDisclosure({
  items,
}: {
  items: readonly { readonly label: string; readonly href: string }[];
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    if (menu === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.open) return;
      const hadFocus = menu.contains(document.activeElement);
      menu.open = false;
      if (hadFocus) menu.querySelector("summary")?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <nav aria-label="Primary" className="lg:hidden">
      <details
        ref={menuRef}
        className="nav-menu relative"
        onClick={(event) => {
          if ((event.target as Element).closest("a") !== null) event.currentTarget.open = false;
        }}
        onBlur={(event) => {
          // Only when focus lands somewhere else: a press that drops focus is handled on pointerdown.
          const menu = event.currentTarget;
          const next = event.relatedTarget;
          if (next !== null && !menu.contains(next)) menu.open = false;
        }}
      >
        <summary className="flex h-9 cursor-pointer list-none items-center border border-rule-strong px-3.5 text-[0.875rem] font-semibold pointer-coarse:h-11 pointer-coarse:px-4">
          Menu
        </summary>
        <div className="nav-menu-panel absolute right-0 top-11 w-56 border border-rule-strong bg-sheet-raised p-2 pointer-coarse:top-13">
          <ul className="flex flex-col">
            {items.map((item) => (
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
                Get started<span className="sr-only"> on GitHub</span>
              </a>
            </li>
          </ul>
        </div>
      </details>
    </nav>
  );
}
