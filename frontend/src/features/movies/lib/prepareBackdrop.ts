import { movieImageUrl } from '../api/images'

/** Match MovieImage's responsive source selection, and keep the old scene until decoding finishes. */
export function prepareBackdrop(path: string | null): Promise<boolean> {
  const source = movieImageUrl(path, 'w1280')
  if (!source) return Promise.resolve(false)
  return new Promise(resolve => {
    const image = new Image()
    let settled = false
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      image.onload = image.onerror = null
      resolve(ready)
    }
    const timeout = window.setTimeout(() => finish(false), 8000)
    image.onload = () => { void image.decode().then(() => finish(true), () => finish(image.naturalWidth > 0)) }
    image.onerror = () => finish(false)
    image.sizes = '100vw'
    image.srcset = `${movieImageUrl(path, 'w780')} 780w, ${source} 1280w`
    image.src = source
  })
}
