function formatter(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
}
function partsAt(instant: number, timezone: string) {
  const values = Object.fromEntries(formatter(timezone).formatToParts(instant).map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`
}
export function suggestedTimezone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone }
export function validTimezone(timezone: string): boolean {
  try { formatter(timezone); return timezone.length > 0 && timezone.length <= 64 && !/^[+-]/.test(timezone) } catch { return false }
}
function wallTime(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) throw new RangeError('Enter a valid local date and time.')
  const normalized = local.length === 16 ? `${local}:00` : local
  const nominal = Date.parse(`${normalized}Z`)
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 19) !== normalized) throw new RangeError('Enter a valid local date and time.')
  return { normalized, nominal }
}
export function utcSeconds(instant: number | Date): string {
  const date = new Date(instant)
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new RangeError('Invalid instant.')
  return `${date.toISOString().slice(0, 19)}Z`
}
export function utcToLocal(utc: string, timezone: string): string {
  if (!validTimezone(timezone) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(utc)) throw new RangeError('Use a UTC instant and an IANA timezone.')
  wallTime(utc.slice(0, 19))
  const instant = Date.parse(utc)
  if (!Number.isFinite(instant)) throw new RangeError('Invalid instant.')
  return partsAt(instant, timezone)
}
export type LocalTimeResolution = { kind: 'gap' | 'unique' | 'overlap'; instants: string[] }
export function resolveLocalTime(local: string, timezone: string): LocalTimeResolution {
  if (!validTimezone(timezone)) throw new RangeError('Choose a valid IANA timezone.')
  const { normalized, nominal } = wallTime(local)
  // Offsets on both sides of transitions include half-hour shifts and skipped days.
  // Exact wall-time comparison rejects nonexistent times rather than silently shifting them.
  const offsets = new Set<number>()
  for (let hours = -72; hours <= 72; hours += 6) {
    const sample = nominal + hours * 3600000
    offsets.add(Date.parse(`${partsAt(sample, timezone)}Z`) - sample)
  }
  const instants = [...offsets].map(offset => nominal - offset)
    .filter(instant => partsAt(instant, timezone) === normalized).sort((a, b) => a - b).map(utcSeconds)
  return { kind: instants.length === 0 ? 'gap' : instants.length === 1 ? 'unique' : 'overlap', instants }
}
export function localToUtc(local: string, timezone: string, overlap?: 'earlier' | 'later'): string {
  const resolved = resolveLocalTime(local, timezone)
  if (resolved.kind === 'gap') throw new RangeError('This local time does not exist because the timezone offset changes. Choose another time.')
  if (resolved.kind === 'overlap' && !overlap) throw new RangeError('This local time occurs twice. Choose the earlier or later occurrence.')
  return resolved.instants[overlap === 'later' ? resolved.instants.length - 1 : 0]
}
export function schedulePreview(utc: string, timezone: string): string {
  utcToLocal(utc, timezone)
  return `${new Intl.DateTimeFormat(undefined, { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }).format(new Date(utc))} (${timezone})`
}
