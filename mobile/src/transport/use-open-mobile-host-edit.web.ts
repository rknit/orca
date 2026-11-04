import { useCallback } from 'react'
import { useRouter } from 'expo-router'

// Native rebuilds the host stack underneath; the page has no such stack, so it pushes the screen directly.
export function useOpenMobileHostEdit(): (hostId: string) => void {
  const router = useRouter()
  return useCallback(
    (hostId) => {
      router.push(`/h/${encodeURIComponent(hostId)}/edit`)
    },
    [router]
  )
}
