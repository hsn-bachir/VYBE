import { useId, useRef, useState } from 'react'
import { Input } from '../../../components/ui/Input'
import { Button } from '../../../components/ui/Button'
import { movieNightError } from '../api/errors'
import { eventFormPayload, eventFormValues, formSchedule, type EventFormErrors, type EventFormValues } from '../lib/eventForm'
import { resolveLocalTime, schedulePreview } from '../lib/dateTime'
import type { EventFields, MovieNight } from '../types/movieNight.types'

export function MovieNightForm({ night, busy = false, onSave, onCancel }: {
  night?: MovieNight; busy?: boolean; onSave: (fields: Partial<EventFields>) => Promise<void>; onCancel: () => void
}) {
  const [initial] = useState(() => eventFormValues(night))
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<EventFormErrors>({})
  const submitting = useRef(false)
  const zoneList = useId(), errorHeading = useRef<HTMLParagraphElement>(null)
  const zones = [...new Set([initial.timezone, 'UTC', ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [])])]
  const set = (key: keyof EventFormValues, value: string) => {
    setValues(old => ({ ...old, [key]: value, ...(['date', 'time', 'timezone'].includes(key) ? { occurrence: '' as const } : {}) }))
    setErrors({})
  }
  let preview = '', scheduleIssue = '', instants: string[] = []
  if (values.date && values.time) {
    try {
      const resolution = resolveLocalTime(`${values.date}T${values.time}`, values.timezone)
      if (resolution.kind === 'overlap') instants = resolution.instants
      preview = schedulePreview(formSchedule(values), values.timezone)
    } catch (error) { scheduleIssue = error instanceof Error ? error.message : 'Check the schedule.' }
  }
  return <form className="night-event-form" noValidate onSubmit={async event => {
    event.preventDefault()
    if (submitting.current || busy) return
    const result = eventFormPayload(values, night ? initial : undefined)
    if (!result.fields) { setErrors(result.errors); requestAnimationFrame(() => errorHeading.current?.focus()); return }
    submitting.current = true
    setErrors({})
    try { await onSave(result.fields) }
    catch (error) {
      const details = movieNightError(error)
      setErrors({ ...Object.fromEntries(Object.entries(details.fields).map(([key, messages]) => [key, messages[0]])), form: details.message })
      requestAnimationFrame(() => errorHeading.current?.focus())
    } finally { submitting.current = false }
  }}>
    {Object.keys(errors).length > 0 && <p ref={errorHeading} tabIndex={-1} className="form-error" role="alert">{errors.form ?? 'Please check the highlighted fields.'}</p>}
    <fieldset disabled={busy} className="night-form-fields">
      <Input label="Event title" name="title" required value={values.title} onChange={event => set('title', event.target.value)} error={errors.title} hint="Up to 150 characters." autoFocus={!!night} />
      <div className="night-form-row">
        <Input label="Scheduled date" name="date" type="date" required value={values.date} onChange={event => set('date', event.target.value)} />
        <Input label="Scheduled time" name="time" type="time" step="1" required value={values.time} onChange={event => set('time', event.target.value)} />
      </div>
      <Input label="Timezone" name="timezone" list={zoneList} autoComplete="off" required value={values.timezone} onChange={event => set('timezone', event.target.value)} error={errors.timezone} hint="Search or enter an IANA timezone, such as Asia/Beirut. Changing it keeps your entered date and time." />
      <datalist id={zoneList}>{zones.map(zone => <option value={zone} key={zone} />)}</datalist>
      {instants.length > 1 && <fieldset className="night-occurrence"><legend>This time occurs twice. Choose an occurrence.</legend>{(['earlier', 'later'] as const).map((choice, index) => <label key={choice}><input type="radio" name="occurrence" value={choice} checked={values.occurrence === choice} onChange={() => set('occurrence', choice)} />{choice === 'earlier' ? 'Earlier' : 'Later'} occurrence <small>({instants[index]})</small></label>)}</fieldset>}
      <div className="night-preview" aria-live="polite"><span className="eyebrow">Schedule preview</span><p>{preview || scheduleIssue || 'Choose a date, time and timezone to preview your movie night.'}</p>{errors.starts_at && <p className="field-error" role="alert">{errors.starts_at}</p>}</div>
      <Input label="Physical location (optional)" name="location" value={values.location} onChange={event => set('location', event.target.value)} error={errors.location} hint="Up to 500 characters. Only the host and accepted guests can see this." />
      <Input label="Meeting URL (optional)" name="meeting_url" type="url" value={values.meeting_url} onChange={event => set('meeting_url', event.target.value)} error={errors.meeting_url} hint="Use an HTTPS link, up to 2048 characters. Visible only to the host and accepted guests." />
      <div className="night-form-actions"><Button type="button" className="secondary" onClick={() => { if (!submitting.current) onCancel() }}>Cancel</Button><Button type="submit" className="primary">{busy ? 'Saving…' : night ? 'Save changes' : 'Create Movie Night'}</Button></div>
    </fieldset>
  </form>
}
