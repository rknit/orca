import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { firstParam } from '../src/navigation/route-param-reader'
import { NewWorkspaceHostPicker } from '../src/new-workspace/NewWorkspaceHostPicker'
import { readOfferedHostIds } from '../src/new-workspace/new-workspace-overlay-route'

/** The native overlay mounts a WebView shell; here the page opens the server's own screen directly. */
export default function NewWorkspaceRoute() {
  const params = useLocalSearchParams<{ hostIds?: string | string[] }>()
  const router = useRouter()
  const [offered] = useState(() => readOfferedHostIds(firstParam(params.hostIds)))
  const only = offered.length === 1 ? offered[0] : null
  useEffect(() => {
    if (only) {
      router.replace(`/h/${encodeURIComponent(only)}/new-workspace`)
    }
  }, [only, router])
  return only ? null : (
    <NewWorkspaceHostPicker
      hostIds={offered}
      onPick={(hostId) => router.push(`/h/${encodeURIComponent(hostId)}/new-workspace`)}
    />
  )
}
