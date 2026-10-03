"use client";

import {
  useId,
  useRef,
  useState,
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

/**
 * The five commands as a schedule beside one terminal. The schedule is a tab list: arrow keys move between
 * commands, Home and End jump to the ends. Switching prints the new transcript line by line.
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
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const command = commands[selected]!;

  const select = (index: number, focus: boolean) => {
    setSelected(index);
    setPrinted(true);
    if (focus) tabs.current[index]?.focus();
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
        aria-orientation="vertical"
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
          <div className="code-block-header">
            <span>terminal</span>
            <span className="text-right">{command.source}</span>
          </div>
          <pre
            key={command.id}
            className={`code-block-body terminal-body${printed ? " is-printing" : ""}`}
            tabIndex={0}
          >
            <code>
              {command.lines.map((line, i) => (
                <span
                  key={i}
                  className="terminal-line block"
                  style={{ "--line": i } as CSSProperties}
                >
                  {line.map((segment, j) =>
                    segment.text === "$ " && j === 0 ? (
                      <span key={j} className="select-none text-graphite">
                        {segment.text}
                      </span>
                    ) : (
                      <span key={j} className={TONE[segment.tone ?? "soft"]}>
                        {segment.text}
                      </span>
                    ),
                  )}
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
