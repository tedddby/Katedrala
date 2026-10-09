/**
 * The Katedrala mark: two members meeting at a loaded joint above a pinned support, drawn on the same stroke as
 * the page's drawings, set beside the name in the wide cut of the display face.
 */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden="true" viewBox="0 0 22 22" className="size-[1.375rem]">
        <path
          d="M2 4.5 11 12l9-7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="12" r="2.4" className="fill-load" />
        <path
          d="M11 14.6 7.6 19.4h6.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[1.0625rem] font-bold tracking-[0.14em] [font-variation-settings:'wdth'_118]">
        KATEDRALA
      </span>
    </span>
  );
}
