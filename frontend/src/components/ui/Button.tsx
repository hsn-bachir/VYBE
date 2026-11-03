import type { ComponentPropsWithRef } from 'react'

export function Button({ className = '', ...props }: ComponentPropsWithRef<'button'>) {
  return <button className={`button ${className}`} {...props} />
}
