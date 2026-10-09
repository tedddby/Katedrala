import { STATUS_LABEL, type Status as StatusValue } from "@/lib/site";

/**
 * Whether a capability ships today, is planned for v1 or comes after it. Attached to the thing it describes,
 * never used as decoration: a filled square for available, an open square for planned for v1, and only the
 * square's corners for after v1. The square sits on whole pixels with a 1px stroke, so all three stay crisp
 * and distinct at 1x.
 */
export function Status({ status, label }: { status: StatusValue; label?: string }) {
  return (
    <span className="status" data-status={status}>
      <svg aria-hidden="true" viewBox="0 0 8 8" className="size-2 shrink-0">
        <rect
          x="0.5"
          y="0.5"
          width="7"
          height="7"
          fill={status === "available" ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1"
          shapeRendering="crispEdges"
          // After v1: dashes centered on the corners (2.5 units each way), a 2-unit gap mid-side.
          {...(status === "after-v1" ? { strokeDasharray: "5 2", strokeDashoffset: "2.5" } : {})}
        />
      </svg>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
