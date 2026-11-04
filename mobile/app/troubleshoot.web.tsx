import { useRouter } from 'expo-router'
import { TroubleshootView } from '../src/diagnostics/troubleshoot-view'
import { useTroubleshootDiagnostics } from '../src/diagnostics/use-troubleshoot-diagnostics'

// Omits the native rows: they inspect the shell's bundle cache, which a browser doesn't have.
export default function WebTroubleshootRoute() {
  const router = useRouter()
  const { rootRef, diagnosticStatus, checks, hostEndpoints, runDiagnostics } =
    useTroubleshootDiagnostics()
  return (
    <TroubleshootView
      rootRef={rootRef}
      diagnosticStatus={diagnosticStatus}
      checks={checks}
      hostEndpoints={hostEndpoints}
      runDiagnostics={() => void runDiagnostics()}
      onBack={() => router.back()}
      onConnectionLog={() => router.push('/connection-log')}
      developerRow={null}
    />
  )
}
