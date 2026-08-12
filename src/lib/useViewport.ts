'use client'

import { useEffect, useLayoutEffect, useState } from 'react'

import { REFERENCE_VIEWPORT } from './layout'
import { layoutFor, type ResponsiveLayout } from './responsive'

/**
 * The responsive layout for the current viewport.
 *
 * Server-renders at the reference size so the first paint is the reference,
 * then corrects before paint on the client.
 */
/**
 * Runs before paint on the client, and is a no-op during SSR. Without it a phone
 * paints one frame laid out for the 1090px reference and then snaps.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function useViewportLayout(): ResponsiveLayout {
  const [size, setSize] = useState(REFERENCE_VIEWPORT as { width: number; height: number })

  useIsomorphicLayoutEffect(() => {
    // innerWidth/innerHeight, NOT visualViewport: the visual viewport shrinks
    // when the user pinch-zooms, so reading it would re-lay-out smaller and
    // cancel the magnification instead of providing it.
    const read = () =>
      setSize({ width: Math.round(window.innerWidth), height: Math.round(window.innerHeight) })
    read()
    window.addEventListener('resize', read)
    window.visualViewport?.addEventListener('resize', read)
    return () => {
      window.removeEventListener('resize', read)
      window.visualViewport?.removeEventListener('resize', read)
    }
  }, [])

  return layoutFor(size.width, size.height)
}
