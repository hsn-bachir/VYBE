/**
 * Faithful lightweight adaptation of React Bits Peek Rating by David Haz (2026).
 * Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Micro/PeekRating
 * License: ./PeekRating.LICENSE.md (MIT + Commons Clause).
 * Native radios and inline stars replace gesture capture/Hugeicons. Controlled server value;
 * preview lift is local, and confirmation pop is triggered only by a successful server response.
 */
import { useId, useState } from 'react'

export function PeekRating({ value, onChange, disabled = false, confirmation = 0, resetKey = 0 }: {
  value: number | null; onChange: (value: number) => void; disabled?: boolean; confirmation?: number; resetKey?: number
}) {
  const name = useId()
  const [hover, setHover] = useState<{ star: number; revision: number; base: number | null } | null>(null)
  const preview = hover?.revision === resetKey && hover.base === value ? hover.star : null
  const setPreview = (star: number | null) => setHover(star === null ? null : { star, revision: resetKey, base: value })
  const shown = disabled ? value ?? 0 : preview ?? value ?? 0
  return <fieldset className="peek-rating" disabled={disabled} aria-busy={disabled}>
    <legend className="sr-only">Your rating</legend>
    <div className="peek-stars" onMouseLeave={() => setPreview(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPreview(null) }}>
      {[1, 2, 3, 4, 5].map(star => <label key={star} className={`peek-option ${star <= shown ? 'is-lit' : ''} ${!disabled && preview !== null && star <= preview ? 'is-previewed' : ''} ${star === preview ? 'is-target' : ''}`} onMouseEnter={() => { if (!disabled) setPreview(star) }}>
        <input type="radio" name={name} value={star} checked={value === star} onChange={() => onChange(star)} onFocus={() => { if (!disabled) setPreview(star) }} aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`} />
        <span className="peek-glyph"><svg key={`${star}:${confirmation}`} className={confirmation > 0 && value === star ? 'peek-confirmed' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.78 5.64L21 9.55l-4.5 4.39L17.56 20 12 17.08 6.44 20l1.06-6.06L3 9.55l6.22-.91z" /></svg></span>
      </label>)}
    </div>
    <p className="peek-tip" aria-hidden="true">{preview !== null && !disabled ? `${preview} ${preview === 1 ? 'star' : 'stars'}` : value ? `${value} / 5 stars` : 'Select a star to rate'}</p>
  </fieldset>
}
