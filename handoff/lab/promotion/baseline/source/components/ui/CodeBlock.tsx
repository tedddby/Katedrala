"use client";

import { useEffect, useId, useRef, useState } from "react";

interface CodeBlockProps {
  readonly code: string;
  /** Shown in the block's header, e.g. `katedrala.config.yaml` or `terminal`. */
  readonly label: string;
  readonly language?: "yaml" | "shell" | "json" | "typescript" | "text";
  readonly className?: string;
}

type CopyState = "idle" | "copied" | "failed";

const ANNOUNCEMENT: Record<CopyState, (label: string) => string> = {
  idle: () => "",
  copied: (label) => `${label} copied.`,
  failed: () => "Copy failed. Select the code to copy it.",
};

/**
 * Code as it would appear in a file or terminal, with a copy control. Highlighting is deliberately light: keys,
 * comments and prompts only, in the page's chalk and graphite.
 */
export function CodeBlock({ code, label, language = "text", className }: CodeBlockProps) {
  const [copy, setCopy] = useState<CopyState>("idle");
  const [scrolls, setScrolls] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const body = useRef<HTMLPreElement>(null);
  const labelId = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // While the code is wider than its block (narrow screens), the block becomes a named region the keyboard can
  // reach and scroll, and the edge it continues past fades (data-overflow), as in the terminal.
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
  }, []);

  const onCopy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code.replace(/^\$ /gm, ""));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    timer.current = window.setTimeout(() => setCopy("idle"), 1600);
  };

  return (
    <figure className={`code-block ${className ?? ""}`} aria-labelledby={labelId}>
      <div className="code-block-header">
        <span id={labelId}>{label}</span>
        <button type="button" onClick={onCopy} className="code-copy">
          {copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy"}
          <span className="sr-only"> {label}</span>
        </button>
      </div>
      <span role="status" className="sr-only">
        {ANNOUNCEMENT[copy](label)}
      </span>
      <pre
        ref={body}
        className="code-block-body"
        {...(scrolls ? { tabIndex: 0, role: "region", "aria-label": label } : {})}
      >
        <code>{highlight(code, language)}</code>
      </pre>
    </figure>
  );
}

function highlight(code: string, language: CodeBlockProps["language"]) {
  return code.split("\n").map((line, i) => (
    <span key={i} className="block">
      {renderLine(line, language)}
      {"\n"}
    </span>
  ));
}

function renderLine(line: string, language: CodeBlockProps["language"]) {
  if (language === "shell" && line.startsWith("$ ")) {
    return (
      <>
        <span className="select-none text-ink-faint">$ </span>
        <span className="text-ink">{line.slice(2)}</span>
      </>
    );
  }
  if (language === "yaml") {
    if (/^\s*#/.test(line)) return <span className="text-ink-faint">{line}</span>;
    const match = /^(\s*-?\s*)([A-Za-z0-9_.-]+)(:)(.*)$/.exec(line);
    if (match) {
      return (
        <>
          {match[1]}
          <span className="text-ink">{match[2]}</span>
          <span className="text-ink-faint">{match[3]}</span>
          <span className="text-ink-soft">{match[4]}</span>
        </>
      );
    }
  }
  if (language === "json") {
    const match = /^(\s*)("[^"]+")(:)(.*)$/.exec(line);
    if (match) {
      return (
        <>
          {match[1]}
          <span className="text-ink">{match[2]}</span>
          <span className="text-ink-faint">{match[3]}</span>
          <span className="text-ink-soft">{match[4]}</span>
        </>
      );
    }
  }
  if (language === "typescript") {
    if (/^\s*\/\//.test(line)) return <span className="text-ink-faint">{line}</span>;
    return line.split(TS_TOKEN).map((part, i) =>
      part === "" ? null : (
        <span
          key={i}
          className={
            TS_KEYWORD.test(part)
              ? "text-ink-faint"
              : /^["`]/.test(part)
                ? "text-ink-soft"
                : "text-ink"
          }
        >
          {part}
        </span>
      ),
    );
  }
  return <span className="text-ink-soft">{line}</span>;
}

const TS_TOKEN =
  /("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\b(?:import|from|const|await|export|function|return)\b)/;
const TS_KEYWORD = /^(?:import|from|const|await|export|function|return)$/;
