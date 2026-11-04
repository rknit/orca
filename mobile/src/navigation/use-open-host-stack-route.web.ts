import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import type { HostStackRouteTarget } from './host-stack-navigation'

// Native rebuilds the root stack with the host beneath the target; the page has no such stack, so
// that navigation stops on the host screen. Pushing the target keeps browser Back working.
export function useOpenHostStackRoute(): (hostId: string, target: HostStackRouteTarget) => void {
  const router = useRouter()
  return useCallback(
    (_hostId, target) => {
      const query = new URLSearchParams()
      const path = target.name.replace(/\[(\w+)\]/g, (_match, key: string) =>
        encodeURIComponent(target.params[key] ?? '')
      )
      for (const [key, value] of Object.entries(target.params)) {
        if (!target.name.includes(`[${key}]`)) {
          query.set(key, value)
        }
      }
      const search = query.toString()
      router.push(`/h/${path.replace(/\/index$/, '')}${search ? `?${search}` : ''}`)
    },
    [router]
  )
}
