import { useState, type InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> { label: string; error?: string; hint?: string }
export function Input({ label, error, hint, type = 'text', id, ...props }: Props) {
  const [visible, setVisible] = useState(false)
  const inputId = id ?? props.name
  return <div className="field">
    <label htmlFor={inputId}>{label}</label>
    <div className="input-wrap">
      <input {...props} id={inputId} type={type === 'password' && visible ? 'text' : type}
        aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${inputId}-help` : undefined} />
      {type === 'password' && <button className="reveal" type="button" disabled={props.disabled}
        aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}
        onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>}
    </div>
    {(error || hint) && <p id={`${inputId}-help`} className={error ? 'field-error' : 'hint'}>{error || hint}</p>}
  </div>
}
