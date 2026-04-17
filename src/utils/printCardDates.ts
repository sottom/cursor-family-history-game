import type { MarriageEntry } from '../state/appState'

/**
 * Format stored ISO-ish date strings for print-card badge display (year + small subline).
 */
export function formatDateForPrintBadge(dateISO?: string): { year: string; subline: string } {
  if (!dateISO?.trim()) return { year: '—', subline: '' }
  const s = dateISO.trim()
  if (/^\d{4}$/.test(s)) return { year: s, subline: '' }

  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear()
    const sub = s.length >= 10 ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
    return { year: String(y), subline: sub }
  }

  return { year: s.slice(0, 4) || '—', subline: s.length > 5 ? s.slice(5) : '' }
}

/** Pick a marriage row to show on the print preview: current with a date, else first with a date, else first. */
export function pickMarriageForPrintPreview(marriages: MarriageEntry[] | undefined): MarriageEntry | undefined {
  if (!marriages?.length) return undefined
  const withDate = marriages.filter((m) => m.dateISO?.trim())
  const current = withDate.find((m) => m.isCurrent)
  if (current) return current
  if (withDate.length) return withDate[0]
  return marriages[0]
}
