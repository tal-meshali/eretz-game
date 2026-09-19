import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

/* jsdom implements <canvas> as far as the element and no further: getContext
   answers null, and Leaflet's canvas renderer — which the map draws its
   ~110k-vertex roadmap with — calls straight into the context it is handed.
   A no-op 2D context lets every map test run without pulling in a native
   canvas build; nothing here asserts on what was painted. */
const noopContext = new Proxy(
  {},
  {
    get: (target: Record<string, unknown>, prop: string) => {
      if (prop in target) return target[prop]
      return () => undefined
    },
    set: (target: Record<string, unknown>, prop: string, value: unknown) => {
      target[prop] = value
      return true
    },
  },
)

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext =
    (() => noopContext) as unknown as HTMLCanvasElement['getContext']
}

afterEach(cleanup)
