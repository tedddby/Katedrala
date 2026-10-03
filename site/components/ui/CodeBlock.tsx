"use client";

import { useEffect, useRef, useState } from "react";

interface CodeBlockProps {
  readonly code: string;
  /** Shown in the block's header, e.g. `katedrala.config.yaml` or `terminal`. */
  readonly label: string;
  readonly language?: "yaml" | "shell" | "json" | "typescript" | "text";
  readonly className?: string;
}

/**
 * Code as it would appear in a file or terminal, with a copy control. Highlighting is deliberately light: keys,
 * comments and prompts only, in the page's chalk and graphite.
 */
export function CodeBlock({ code, label, language = "text", className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.replace(/^\$ /gm, ""));
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className={`code-block ${className ?? ""}`}>
      <figcaption className="code-block-header">
        <span>{label}</span>
        <button type="button" onClick={copy} className="code-copy" aria-live="polite">
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="code-block-body" tabIndex={0}>
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
        <span className="text-graphite select-none">$ </span>
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
