import { useState } from 'react'
import './Avatar.css'

function safeAvatarUrl(value: string | null): string | undefined {
  if (!value) return undefined
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? value : undefined } catch { return undefined }
}
export function Avatar({ username, url, className = '' }: { username: string; url: string | null; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const source = safeAvatarUrl(url)
  return <span className={`user-avatar ${className}`} aria-hidden="true"><span>{[...username][0]?.toUpperCase() || 'V'}</span>{source && failedUrl !== source && <img src={source} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(source)} />}</span>
}
