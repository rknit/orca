// Stands in for the native shell: the same bridge host, served from this document instead of a WebView's parent.
import { MOBILE_PWA_PAGE_ROUTES } from '../../../config/scripts/mobile-pwa-page-routes.mjs'
import { createBridgeHost } from '../mobile-web-shell/bridge-host'
import {
  clipboardWriteParamsSchema as CLIPBOARD_WRITE,
  storageReadParamsSchema,
  type BridgeNativeVerb
} from '../mobile-web-shell/bridge/bridge-native-verbs'
import type { OrcaBridgePageChannel } from '../mobile-web-shell/bridge/orca-bridge-page-channel'
import { routeViewOf } from '../mobile-web-shell/page-route-policy'
import { publishPageHostPeers } from '../mobile-web-shell/bridge/page-host-profile'
import { parsePairingCode } from '../transport/pairing'
import { recordHostDescriptorFromStatus } from '../transport/host-descriptor-recorder'
import { readProbedHostStatus } from '../transport/host-status-probe-operations'
import { connect } from '../transport/rpc-client'
import { createStableLogicalRpcClient } from '../transport/stable-logical-rpc-client'
import { readAudio, startAudio, stopAudio } from './pwa-audio'
import {
  readMachineName,
  readPersonalHostName,
  saveMachineName,
  setActiveHostForNames
} from './pwa-host-name'
import { nameMedia, pickMedia, pickMediaInTap, readMedia, releaseMedia } from './pwa-media'
import { registerInTapMediaPicker } from '../platform/in-tap-media-picker'
import {
  PAIRING_PATH,
  readActivePairing,
  readPairings,
  setActivePairing,
  showPageFault,
  showPairingForm,
  type StoredPairing
} from './pwa-pairing'
import { readColorScheme, readInitialViewport, trackViewport } from './pwa-viewport'

const STORAGE_PREFIX = 'orca-pwa:page:'
const SWITCHED_KEY = 'orca-pwa:switched-server'
// The rail needs a side inset only native can draw; without external navigation, sealed previews render links as text.
const UNSUPPORTED_GRANTS = new Set(['terminalKeyRail', 'externalNavigation'])

function readPageStorage(): Record<string, string> {
  const storage: Record<string, string> = {}
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(STORAGE_PREFIX)) {
      storage[key.slice(STORAGE_PREFIX.length)] = localStorage.getItem(key) ?? ''
    }
  }
  return storage
}

async function serveNativeVerb(verb: BridgeNativeVerb, params: unknown): Promise<unknown> {
  switch (verb) {
    case 'native.storage.read':
      return {
        value: localStorage.getItem(STORAGE_PREFIX + storageReadParamsSchema.parse(params).key)
      }
    case 'native.clipboard.write':
      await navigator.clipboard.writeText(CLIPBOARD_WRITE.parse(params).value)
      return { written: true }
    case 'native.clipboard.read':
      return { value: await navigator.clipboard.readText() }
    case 'native.media.pick':
      return await pickMedia(params)
    case 'native.media.read':
      return await readMedia(params)
    case 'native.media.release':
      return releaseMedia(params)
    case 'native.media.name':
      return nameMedia(params)
    case 'native.audio.start':
      return await startAudio(params)
    case 'native.audio.read':
      return readAudio(params)
    case 'native.audio.stop':
      return stopAudio()
    case 'native.pdf.view':
      throw new Error(`${verb} is not available in the web app`)
  }
}

function hostSegment(pathname: string): { hostId: string; rest: string } | null {
  const match = pathname.match(/^\/h\/([^/]+)(\/.*)?$/)
  return match ? { hostId: decodeURIComponent(match[1]!), rest: match[2] ?? '' } : null
}

// Handed-off targets reload under their own grants, on whichever listed server they name.
function isPairedHostPath(pathname: string, pairings: readonly StoredPairing[]): boolean {
  const segment = hostSegment(pathname)
  return segment !== null && pairings.some((pairing) => pairing.id === segment.hostId)
}

// A document holds one connection, so opening another server means loading it fresh.
function pickServerFromUrl(pairings: readonly StoredPairing[]): void {
  const segment = hostSegment(location.pathname)
  if (segment && pairings.some((pairing) => pairing.id === segment.hostId)) {
    if (segment.hostId !== readActivePairing()?.id) {
      setActivePairing(segment.hostId)
      sessionStorage.setItem(SWITCHED_KEY, '1')
    }
  }
}

// Safari reopens the last address, but the app's landing page is Home; an edited or stale host
// segment still means the server this document is connected to.
function landingPath(pathname: string, hostRoot: string): string {
  const segment = hostSegment(pathname)
  if (!segment) {
    return pathname
  }
  if (sessionStorage.getItem(SWITCHED_KEY) !== null) {
    sessionStorage.removeItem(SWITCHED_KEY)
    return hostRoot + segment.rest
  }
  return segment.rest && segment.rest !== '/' ? hostRoot + segment.rest : '/'
}

// Home links to any listed server; the router would otherwise stay in this document's connection.
function reloadWhenLeavingServer(hostId: string, pairings: readonly StoredPairing[]): void {
  const pushState = history.pushState.bind(history)
  history.pushState = (state, title, url) => {
    const pathname = url ? new URL(url, location.href).pathname : ''
    // The native pairing screens are bundled but can't save a server here; the web form can.
    if (pathname.startsWith('/pair')) {
      location.assign(PAIRING_PATH)
      return
    }
    const segment = hostSegment(pathname)
    if (
      segment &&
      segment.hostId !== hostId &&
      pairings.some((pairing) => pairing.id === segment.hostId)
    ) {
      location.assign(String(url))
      return
    }
    pushState(state, title, url)
  }
}

function otherServers(activeId: string, pairings: readonly StoredPairing[]) {
  return pairings
    .filter((pairing) => pairing.id !== activeId)
    .flatMap((pairing) => {
      const offer = parsePairingCode(pairing.code)
      const machineName = readMachineName(pairing.id)
      const personalName = readPersonalHostName(pairing.id)
      return offer
        ? [
            {
              id: pairing.id,
              name: personalName ?? machineName ?? pairing.id,
              ...(personalName ? { personalName } : {}),
              ...(machineName ? { lastKnownMachineName: machineName } : {}),
              endpoint: offer.endpoint,
              lastConnected: 0
            }
          ]
        : []
    })
}

export function startPwaHost(root: HTMLElement): void {
  const pairings = readPairings()
  pickServerFromUrl(pairings)
  const active = readActivePairing()
  if (!active) {
    showPairingForm(root)
    return
  }
  const { id: HOST_ID, offer } = active
  const HOST_ROOT = `/h/${HOST_ID}`
  setActiveHostForNames(HOST_ID)
  publishPageHostPeers(otherServers(HOST_ID, pairings))
  reloadWhenLeavingServer(HOST_ID, pairings)
  const channel: OrcaBridgePageChannel = {
    postMessage: (json) => queueMicrotask(() => host.receive(json)),
    onmessage: null
  }
  const scope: typeof globalThis & { orcaBridge?: OrcaBridgePageChannel } = globalThis
  scope.orcaBridge = channel
  registerInTapMediaPicker(pickMediaInTap)

  const client = createStableLogicalRpcClient(
    connect(offer.endpoint, offer.deviceToken, offer.publicKeyB64),
    'lan'
  )
  history.replaceState(null, '', landingPath(location.pathname, HOST_ROOT) + location.search)
  const pathname = location.pathname
  const view = routeViewOf(MOBILE_PWA_PAGE_ROUTES, pathname, innerWidth >= 768)
  const supported = (grants: readonly string[]) => grants.filter((g) => !UNSUPPORTED_GRANTS.has(g))

  const machineName = readMachineName()
  const personalName = readPersonalHostName()
  const fail = (message: string) => {
    console.error('[pwa]', message)
    showPageFault(root, message)
  }

  const host = createBridgeHost({
    client,
    buildId: 'pwa',
    sessionId: crypto.randomUUID(),
    route: { pathname },
    pageRoutes: view.pageRoutes,
    pageRouteGrants: view.pageRouteGrants.map((pair) => ({
      pathname: pair.pathname,
      grants: supported(pair.grants)
    })),
    routeGrants: supported(view.routeGrants),
    ownsHostArea: view.ownsHostArea,
    sessionEstablished: false,
    ...readInitialViewport(),
    colorScheme: readColorScheme(),
    host: {
      id: HOST_ID,
      // A generated-style name, so the machine name the server reports takes over as in the native app.
      name: personalName ?? machineName ?? 'Host 1',
      ...(personalName ? { personalName } : {}),
      ...(machineName ? { lastKnownMachineName: machineName } : {}),
      endpoint: offer.endpoint,
      lastConnected: Date.now()
    },
    readClientIdentity: () => offer.deviceToken,
    post: (json) => {
      queueMicrotask(() => channel.onmessage?.({ data: json }))
      return Promise.resolve()
    },
    readStorage: () => ({ storage: readPageStorage(), storageOversize: [] }),
    onStorageWrite: (key, value) => {
      if (value === null) {
        localStorage.removeItem(STORAGE_PREFIX + key)
      } else {
        localStorage.setItem(STORAGE_PREFIX + key, value)
      }
    },
    serveNativeVerb,
    onNavigate: (href, replace) => {
      // Keep the current pairing until a new link replaces it: this may just be a stray tap.
      if (href.startsWith('/pair')) {
        location.assign(PAIRING_PATH)
      } else if (isPairedHostPath(new URL(href, location.href).pathname, pairings)) {
        location[replace ? 'replace' : 'assign'](href)
      } else {
        console.warn('[pwa] no web screen for', href)
      }
    },
    onNavigateBack: () => {
      if (location.pathname === HOST_ROOT) {
        return 'nothing-to-pop'
      }
      history.back()
      return 'popped'
    },
    onExternalLink: (url) => void window.open(url, '_blank', 'noopener'),
    onHaptic: () => {},
    onPageFault: (error) => fail(`The page failed: ${JSON.stringify(error).slice(0, 200)}`),
    onPageReady: () => {},
    onPagePainted: () => {},
    onPageBackClaim: () => {},
    onPageLocation: () => {},
    onRouteParamClear: () => {},
    onRouteRefused: (issue) => fail(`This screen was refused: ${issue}`)
  })

  trackViewport(host)
  // Native records this while pairing; here it arrives once connected, so keep it for the next launch.
  const recordMachineName = async () => {
    const status = readProbedHostStatus(await client.sendRequest('status.get'))?.status
    if (status) {
      recordHostDescriptorFromStatus(HOST_ID, status)
      const name = status.machineName?.trim()
      if (name) {
        saveMachineName(name)
      }
    }
  }
  const unsubscribeState = client.onStateChange((state) => {
    if (state === 'connected') {
      unsubscribeState()
      void recordMachineName().catch(() => {})
    }
  })
  const revive = () => {
    if (document.visibilityState === 'visible') {
      client.notifyForeground('app-resume')
    }
  }
  document.addEventListener('visibilitychange', revive)
  window.addEventListener('pageshow', revive)
  window.addEventListener('online', () => client.notifyForeground('network-change'))
}
