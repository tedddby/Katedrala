import { STATUS_LABEL, type Status as StatusValue } from "@/lib/site";

/**
 * Whether a capability ships today or is being built for v1. Attached to the thing it describes, never used as
 * decoration: a filled square for available, an open square for in development, a dashed one for after v1.
 */
export function Status({ status, label }: { status: StatusValue; label?: string }) {
  return (
    <span className="status" data-status={status}>
      <svg aria-hidden="true" viewBox="0 0 8 8" className="size-2">
        <rect
          x="0.75"
          y="0.75"
          width="6.5"
          height="6.5"
          fill={status === "available" ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          {...(status === "after-v1" ? { strokeDasharray: "2 1.5" } : {})}
        />
      </svg>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
