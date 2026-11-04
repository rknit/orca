// Read the shell’s init.host instead of an absent web keychain; otherwise routes would show Host not found.
import {
  publishPageHostProfile,
  readPageHostPeers,
  readPageHostProfile
} from '../mobile-web-shell/bridge/page-host-profile'
import { savePersonalHostName } from '../pwa/pwa-host-name'
import type { MobileRelayEndpoint } from '../../../src/shared/remote-runtime/relay/mobile-relay-credential-contract'
import type { HostCatalogEntry, HostProfile } from './types'

// The page gets no device credential or public key; RPC uses the shell’s paired client.
function pageHosts(): HostProfile[] {
  const host = readPageHostProfile()
  return (host === null ? [] : [host, ...readPageHostPeers()]).map((listed) => ({
    ...listed,
    deviceToken: '',
    publicKeyB64: ''
  }))
}

export const loadHosts = (): Promise<HostProfile[]> => Promise.resolve(pageHosts())
export const peekHosts = (): HostProfile[] | null => pageHosts()

export const loadHostCatalog = (): Promise<HostCatalogEntry[]> =>
  Promise.resolve(
    pageHosts().map((profile) => ({ ...profile, credentialStatus: 'ready' as const, profile }))
  )

// Pairing belongs to the native shell.
export const savePairedHost = (_host: HostProfile): Promise<void> => Promise.resolve()
/** Relay routing belongs to the native endpoint lifecycle, which the page does not run. */
export const setRelayRouting = (_hostId: string, _relay: MobileRelayEndpoint): Promise<void> =>
  Promise.resolve()
export const removeHost = (_hostId: string): Promise<void> => Promise.resolve()

// Recency belongs to the native host list, which this page does not show.
export const updateLastConnected = (_hostId: string): Promise<void> => Promise.resolve()

// The web app has no native host list to hold a rename; inside a native shell nothing routes here.
export function updateHostNameAndEndpoint(
  _hostId: string,
  updates: { personalName?: string | null; endpoint?: string }
): Promise<void> {
  const host = readPageHostProfile()
  if (host !== null && updates.personalName !== undefined) {
    savePersonalHostName(updates.personalName)
    const { personalName: _previous, ...rest } = host
    publishPageHostProfile(
      updates.personalName === null
        ? { ...rest, name: host.lastKnownMachineName ?? 'Host 1' }
        : { ...rest, personalName: updates.personalName, name: updates.personalName }
    )
  }
  return Promise.resolve()
}

// Last-known descriptors belong to the native host list.
export function updateHostDescriptor(
  _hostId: string,
  _descriptor: { machineName: string | null; platform: NodeJS.Platform | null }
): Promise<void> {
  return Promise.resolve()
}

// The bundle's pairing and settings screens import these; credentials stay with whoever hosts the page.
export const resolvePairingHostIdentity = (
  _publicKeyB64: string,
  newHostId: string
): Promise<{ id: string; name: string }> => Promise.resolve({ id: newHostId, name: newHostId })

export const retryPendingHostCredentialCleanup = (): Promise<{
  clearedCount: number
  remainingIds: string[]
  storageUnreadable: boolean
}> => Promise.resolve({ clearedCount: 0, remainingIds: [], storageUnreadable: false })
