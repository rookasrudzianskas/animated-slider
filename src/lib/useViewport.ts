'use client'

import { useEffect, useState } from 'react'

import { REFERENCE_VIEWPORT } from './layout'
import { layoutFor, type ResponsiveLayout } from './responsive'

/**
 * The responsive layout for the current viewport.
 *
 * Server-renders at the reference size so the first paint is the reference,
 * then corrects on mount. `visualViewport` is preferred where it exists so the
 * iOS keyboard and toolbars do not make the ruler jump.
 */
export function useViewportLayout(): ResponsiveLayout {
  const [size, setSize] = useState(REFERENCE_VIEWPORT as { width: number; height: number })

  useEffect(() => {
    const read = () => {
      const vv = window.visualViewport
      setSize({
        width: Math.round(vv?.width ?? window.innerWidth),
        height: Math.round(vv?.height ?? window.innerHeight),
      })
    }
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
