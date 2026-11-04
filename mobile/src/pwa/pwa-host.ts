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
import type { PairingOffer } from '../../../src/shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import { connect } from '../transport/rpc-client'
import { createStableLogicalRpcClient } from '../transport/stable-logical-rpc-client'
import { nameMedia, pickMedia, readMedia, releaseMedia } from './pwa-media'
import { showPageFault, showPairingForm } from './pwa-pairing'
import { readColorScheme, readInitialViewport, trackViewport } from './pwa-viewport'

const HOST_ID = 'box'
const HOST_ROOT = `/h/${HOST_ID}`
const STORAGE_PREFIX = 'orca-pwa:page:'
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
    // Dictation teardown runs even when it never started.
    case 'native.audio.stop':
      return { stopped: true, base64: '', droppedBytes: 0 }
    case 'native.audio.start':
    case 'native.audio.read':
    case 'native.pdf.view':
      throw new Error(`${verb} is not available in the web app`)
  }
}

export function startPwaHost(root: HTMLElement, offer: PairingOffer): void {
  const channel: OrcaBridgePageChannel = {
    postMessage: (json) => queueMicrotask(() => host.receive(json)),
    onmessage: null
  }
  const scope: typeof globalThis & { orcaBridge?: OrcaBridgePageChannel } = globalThis
  scope.orcaBridge = channel

  const client = createStableLogicalRpcClient(
    connect(offer.endpoint, offer.deviceToken, offer.publicKeyB64),
    'lan'
  )
  const pathname = location.pathname
  const view = routeViewOf(MOBILE_PWA_PAGE_ROUTES, pathname, innerWidth >= 768)
  const supported = (grants: readonly string[]) => grants.filter((g) => !UNSUPPORTED_GRANTS.has(g))

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
    host: { id: HOST_ID, name: HOST_ID, endpoint: offer.endpoint, lastConnected: Date.now() },
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
        showPairingForm(root)
      } else if (href.startsWith(HOST_ROOT)) {
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
  const revive = () => {
    if (document.visibilityState === 'visible') {
      client.notifyForeground('app-resume')
    }
  }
  document.addEventListener('visibilitychange', revive)
  window.addEventListener('pageshow', revive)
  window.addEventListener('online', () => client.notifyForeground('network-change'))
}
