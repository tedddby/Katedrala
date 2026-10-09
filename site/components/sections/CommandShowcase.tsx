"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { CommandDemo, Tone } from "@/lib/demo/commands";

const TONE: Record<Tone, string> = {
  ink: "text-ink",
  soft: "text-ink-soft",
  faint: "text-ink-faint",
  load: "text-load",
};

/** From this width the schedule is a column beside the terminal; below it, rows of tabs above it. */
const COLUMN = "(min-width: 1024px)";

/**
 * A pointer choice prints the transcript line by line: each line takes PRINT_LINE ms (the terminal-print
 * animation in developers.css) and starts at most 32 ms after the one above, sooner in a long transcript, so the
 * last line lands within PRINT_TOTAL ms whatever the length.
 */
const PRINT_LINE = 180;
const PRINT_TOTAL = 400;
const staggerOf = (lines: number) =>
  Math.min(32, Math.floor((PRINT_TOTAL - PRINT_LINE) / Math.max(1, lines - 1)));

function subscribeColumn(onChange: () => void) {
  const query = window.matchMedia(COLUMN);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The five commands as a schedule beside one terminal. The schedule is a tab list: arrow keys move between
 * commands, Home and End jump to the ends. Choosing a command with the pointer prints its transcript line by line.
 */
export function CommandShowcase({
  commands,
  note,
}: {
  commands: readonly CommandDemo[];
  note?: ReactNode;
}) {
  const [selected, setSelected] = useState(0);
  const [printed, setPrinted] = useState(false);
  // Whether the transcript is wider than the terminal: only then is it a named region the keyboard can reach and
  // scroll (as CodeBlock does); a transcript that fits needs no Tab stop.
  const [scrolls, setScrolls] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const body = useRef<HTMLPreElement>(null);
  const id = useId();
  const command = commands[selected]!;
  const column = useSyncExternalStore(
    subscribeColumn,
    () => window.matchMedia(COLUMN).matches,
    () => true,
  );
  // The terminal keeps the height of the longest transcript, so switching commands never moves the page.
  const lines = Math.max(...commands.map((c) => c.lines.length));

  // While a transcript can scroll sideways (narrow screens), mark the edges it continues past; the stylesheet
  // fades them, so a cut line reads as more to come rather than as the end of the output.
  useEffect(() => {
    const pre = body.current;
    if (pre === null) return;
    const update = () => {
      const start = pre.scrollLeft > 1;
      const end = pre.scrollWidth - pre.clientWidth - pre.scrollLeft > 1;
      setScrolls(pre.scrollWidth - pre.clientWidth > 1);
      const value = start && end ? "start end" : start ? "start" : end ? "end" : undefined;
      if (pre.dataset.overflow === value) return;
      if (value === undefined) delete pre.dataset.overflow;
      else pre.dataset.overflow = value;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pre);
    pre.addEventListener("scroll", update, { passive: true });
    void document.fonts.ready.then(update);
    return () => {
      observer.disconnect();
      pre.removeEventListener("scroll", update);
    };
  }, [command.id]);

  // A click prints the new transcript; arrow keys step through commands far faster than it prints, so a switch
  // from the keyboard shows the transcript at once.
  const select = (index: number, fromKeyboard: boolean) => {
    setSelected(index);
    setPrinted(!fromKeyboard);
    if (fromKeyboard) tabs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const last = commands.length - 1;
    const target =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? selected === last
          ? 0
          : selected + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? selected === 0
            ? last
            : selected - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    select(target, true);
  };

  return (
    <div className="grid-12 gap-y-6">
      <div
        role="tablist"
        aria-label="Commands"
        aria-orientation={column ? "vertical" : "horizontal"}
        className="command-schedule col-span-12 lg:col-span-4"
        onKeyDown={onKeyDown}
      >
        {commands.map((c, i) => (
          <button
            key={c.id}
            ref={(element) => {
              tabs.current[i] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${c.id}`}
            aria-selected={i === selected}
            aria-controls={`${id}-panel`}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => select(i, false)}
            className="command-tab"
          >
            <svg aria-hidden="true" viewBox="0 0 10 10" className="command-tab-joint">
              <circle cx="5" cy="5" r="3.5" />
            </svg>
            <span className="data command-tab-name">{c.id}</span>
            <span className="command-tab-question">{c.question}</span>
          </button>
        ))}
      </div>

      <div className="col-span-12 lg:col-span-8">
        <p className="mb-3 text-[0.9375rem] text-ink-soft lg:hidden">{command.question}</p>
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${command.id}`}
          className="code-block"
        >
          <div className="code-block-header terminal-head">
            <span>terminal</span>
            <span className="text-right">{command.source}</span>
          </div>
          <pre
            key={command.id}
            ref={body}
            className={`code-block-body terminal-body${printed ? " is-printing" : ""}`}
            style={
              {
                "--lines": lines,
                "--stagger": `${staggerOf(command.lines.length)}ms`,
              } as CSSProperties
            }
            {...(scrolls
              ? { tabIndex: 0, role: "region", "aria-label": `${command.id} output` }
              : {})}
          >
            <code>
              {command.lines.map((line, i) => (
                <span
                  key={i}
                  className="terminal-line block"
                  style={{ "--line": i } as CSSProperties}
                >
                  {line.map((segment, j) => (
                    // The prompt is typed by nobody, so it is never selected or copied with the command.
                    <span
                      key={j}
                      className={`${TONE[segment.tone ?? "soft"]}${segment.text === "$ " && j === 0 ? " select-none" : ""}`}
                    >
                      {segment.text}
                    </span>
                  ))}
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
        </div>
        {note !== undefined && <div>{note}</div>}
      </div>
    </div>
  );
}
