import { localToUtc, resolveLocalTime, suggestedTimezone, utcSeconds, utcToLocal } from './dateTime'
import type { EventFields, MovieNight } from '../types/movieNight.types'

export interface EventFormValues { title: string; date: string; time: string; timezone: string; location: string; meeting_url: string; occurrence: '' | 'earlier' | 'later' }
export type EventFormErrors = Partial<Record<keyof EventFormValues | 'starts_at' | 'form', string>>
export function eventFormValues(night?: MovieNight): EventFormValues {
  if (!night) return { title: '', date: '', time: '', timezone: suggestedTimezone(), location: '', meeting_url: '', occurrence: '' }
  const local = utcToLocal(night.starts_at, night.timezone)
  const resolution = resolveLocalTime(local, night.timezone)
  return { title: night.title, date: local.slice(0, 10), time: local.slice(11), timezone: night.timezone,
    location: night.location ?? '', meeting_url: night.meeting_url ?? '',
    occurrence: resolution.kind === 'overlap' ? utcSeconds(new Date(night.starts_at)) === resolution.instants[0] ? 'earlier' : 'later' : '' }
}
export function formSchedule(values: EventFormValues) {
  return localToUtc(`${values.date}T${values.time}`, values.timezone, values.occurrence || undefined)
}
const length = (value: string) => [...value].length // Match Laravel's Unicode character lengths, not HTML UTF-16 maxLength.
export function eventFormPayload(values: EventFormValues, original?: EventFormValues, now = Date.now()): { fields?: Partial<EventFields>; errors: EventFormErrors } {
  const errors: EventFormErrors = {}
  const title = values.title.trim(), location = values.location.trim() || null, meeting_url = values.meeting_url.trim() || null
  if (!/\S/u.test(title) || length(title) > 150) errors.title = 'Enter a title of 1–150 characters.'
  if (location && length(location) > 500) errors.location = 'Use no more than 500 characters.'
  if (meeting_url) {
    try { if (!/^https:\/\//i.test(meeting_url) || new URL(meeting_url).protocol !== 'https:' || length(meeting_url) > 2048) throw new Error() }
    catch { errors.meeting_url = 'Enter a valid HTTPS URL of no more than 2048 characters.' }
  }
  let starts_at: string | undefined
  try {
    starts_at = formSchedule(values)
    if (Date.parse(starts_at) <= now) errors.starts_at = 'Choose a scheduled time in the future. The server will check it again.'
  } catch (error) { errors.starts_at = error instanceof Error ? error.message : 'Choose a valid schedule and IANA timezone.' }
  if (Object.keys(errors).length || !starts_at) return { errors }
  const fields: EventFields = { title, starts_at, timezone: values.timezone, location, meeting_url }
  if (!original) return { fields, errors }
  const initial: EventFields = { title: original.title.trim(), starts_at: formSchedule(original), timezone: original.timezone,
    location: original.location.trim() || null, meeting_url: original.meeting_url.trim() || null }
  const changed: Partial<EventFields> = {}
  for (const key of Object.keys(fields) as (keyof EventFields)[]) {
    if (fields[key] !== initial[key]) Object.assign(changed, { [key]: fields[key] })
  }
  if (!Object.keys(changed).length) return { errors: { form: 'Change at least one field before saving.' } }
  return { fields: changed, errors }
}
export function nightRouteId(value: string | undefined): number | undefined {
  // The current API DTO represents SQL IDs as numbers. Reject IDs JavaScript cannot represent exactly.
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}
export function safeMeetingUrl(value: string | null): string | undefined {
  try { return value && /^https:\/\//i.test(value) && new URL(value).protocol === 'https:' ? value : undefined } catch { return undefined }
}
