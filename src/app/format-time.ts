/** Shared time formatting for the storage status and the conflict prompt. */

const pad = (n: number) => String(n).padStart(2, '0')

/** `14:05:09` — the at-a-glance "last save" stamp. */
export function formatClock(at: number): string {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * `2026-08-24 14:05:09` — used where the user compares two versions that may be
 * days apart, so the date cannot be left off.
 */
export function formatDateTime(at: number): string {
  const d = new Date(at)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${date} ${formatClock(at)}`
}
