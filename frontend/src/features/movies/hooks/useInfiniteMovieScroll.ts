import { useEffect, useLayoutEffect, useRef } from 'react'

type Feed = {
  data?: unknown
  hasNextPage: boolean
  isFetching: boolean
  isFetchNextPageError: boolean
  fetchNextPage: () => Promise<unknown>
}

export function useInfiniteMovieScroll(feed: Feed) {
  const sentinel = useRef<HTMLDivElement>(null)
  const current = useRef(feed)
  const hasData = !!feed.data
  useLayoutEffect(() => { current.current = feed }, [feed])
  useEffect(() => {
    const target = sentinel.current
    if (!target || !('IntersectionObserver' in window)) return
    let entered = false
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) { entered = false; return }
      if (entered) return
      entered = true
      const state = current.current
      if (state.hasNextPage && !state.isFetching && !state.isFetchNextPageError) void state.fetchNextPage()
    }, { rootMargin: '500px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasData])
  return sentinel
}
