/**
 * Loading and caching of the face artwork.
 *
 * There are 91 images (ages 5..95). Only two are on screen at a time but the
 * pair changes as fast as the ruler moves, so decoded images are kept in a
 * small LRU: decoding a 620x820 WebP mid-scroll is exactly the kind of work
 * that shows up as a dropped frame.
 */
import { MAX_INDEX, MIN_AGE } from './ruler'

/** Intrinsic size of the artwork — 2x the drawn size. */
export const FACE_W = 620
export const FACE_H = 820
/** Drawn size, in CSS px, at the reference viewport. */
export const FACE_CSS_W = 310
export const FACE_CSS_H = 410

const cache = new Map<number, HTMLImageElement>()
const pending = new Map<number, Promise<HTMLImageElement>>()
const LRU_LIMIT = 24

export function faceSrc(index: number): string {
  return `/faces/${index + MIN_AGE}.webp`
}

/** The decoded image for a tick index, or undefined if it is not ready yet. */
export function getFace(index: number): HTMLImageElement | undefined {
  const img = cache.get(index)
  if (img) {
    // refresh LRU position
    cache.delete(index)
    cache.set(index, img)
  }
  return img
}

export function loadFace(index: number): Promise<HTMLImageElement> {
  const existing = cache.get(index)
  if (existing) return Promise.resolve(existing)
  const inflight = pending.get(index)
  if (inflight) return inflight

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.src = faceSrc(index)
    const done = () => {
      cache.set(index, img)
      while (cache.size > LRU_LIMIT) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        cache.delete(oldest)
      }
      pending.delete(index)
      resolve(img)
    }
    if (img.decode) {
      img.decode().then(done, () => (img.complete ? done() : reject(new Error(`face ${index}`))))
    } else {
      img.onload = done
      img.onerror = () => reject(new Error(`face ${index}`))
    }
  })
  pending.set(index, promise)
  return promise
}

/** Keep the images around `index` decoded so a fast scroll never waits. */
export function warmAround(index: number, radius = 4): void {
  const lo = Math.max(0, Math.round(index) - radius)
  const hi = Math.min(MAX_INDEX, Math.round(index) + radius)
  for (let i = lo; i <= hi; i += 1) {
    if (!cache.has(i) && !pending.has(i)) void loadFace(i).catch(() => {})
  }
}

/**
 * Pull every image into the HTTP cache in the background, cheaply and without
 * decoding, so later warmAround calls are instant.
 */
export function prefetchAll(): void {
  if (typeof window === 'undefined') return
  let i = 0
  const step = () => {
    if (i > MAX_INDEX) return
    const index = i
    i += 1
    fetch(faceSrc(index), { priority: 'low' } as RequestInit)
      .catch(() => {})
      .finally(() => {
        if ('requestIdleCallback' in window) {
          ;(window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(step)
        } else {
          setTimeout(step, 16)
        }
      })
  }
  step()
}
