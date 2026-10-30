import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareBackdrop } from '../lib/prepareBackdrop'

let images: TestImage[]
class TestImage {
  src = ''; srcset = ''; sizes = ''; naturalWidth = 1280
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  decode = vi.fn(() => Promise.resolve())
  constructor() { images.push(this) }
}
beforeEach(() => {
  images = []
  vi.useFakeTimers()
  vi.stubGlobal('Image', TestImage)
  vi.stubGlobal('window', { setTimeout })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('matches responsive backdrop sources and waits for decoding before readiness', async () => {
  let decoded: () => void = () => {}
  const ready = prepareBackdrop('/movie.jpg')
  images[0].decode.mockImplementation(() => new Promise(resolve => { decoded = resolve }))
  expect(images[0].srcset).toContain('/w780/movie.jpg 780w')
  expect(images[0].sizes).toBe('100vw')
  images[0].onload?.()
  const settled = vi.fn()
  void ready.then(settled)
  await Promise.resolve()
  expect(settled).not.toHaveBeenCalled()
  decoded()
  expect(await ready).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
it('bounds an unavailable image request without reporting it ready', async () => {
  const ready = prepareBackdrop('/slow.jpg')
  await vi.advanceTimersByTimeAsync(8000)
  expect(await ready).toBe(false)
  expect(images[0].onload).toBeNull()
})
it('handles image failures and invalid paths without inventing artwork', async () => {
  const ready = prepareBackdrop('/missing.jpg')
  images[0].onerror?.()
  expect(await ready).toBe(false)
  expect(await prepareBackdrop(null)).toBe(false)
  expect(await prepareBackdrop('https://untrusted.example/image.jpg')).toBe(false)
  expect(images).toHaveLength(1)
})
