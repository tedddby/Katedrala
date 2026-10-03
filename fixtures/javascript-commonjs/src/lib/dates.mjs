import html from "./html.cjs";

const { escapeHtml } = html;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isOverdue(due, now = new Date()) {
  return startOfDay(due) < startOfDay(now);
}

export function formatDue(due, now = new Date()) {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 1 ? `in ${days} days` : `${-days} days ago`;
}

export function dueBadge(due, now = new Date()) {
  const label = escapeHtml(formatDue(due, now));
  return isOverdue(due, now) ? `<span class="badge overdue">${label}</span>` : `<span class="badge">${label}</span>`;
}

export default formatDue;
