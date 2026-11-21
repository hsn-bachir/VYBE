import { useEffect, useRef, useState, type ReactNode } from 'react'

export function DeferredSection({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const element = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!element.current || !('IntersectionObserver' in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '500px' })
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  return <div ref={element}>{visible ? children : fallback}</div>
}
