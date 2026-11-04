import type { BridgeInitHost } from './bridge-envelope'

// Publish the init host before render for plain host-store.web.ts functions outside React context; this document’s host never changes.
let profile: BridgeInitHost | null = null

export function publishPageHostProfile(next: BridgeInitHost | null): void {
  profile = next
}

export function readPageHostProfile(): BridgeInitHost | null {
  return profile
}

// Other servers a browser-hosted page can open; a native shell lists those itself and sets none.
let peers: readonly BridgeInitHost[] = []

export function publishPageHostPeers(next: readonly BridgeInitHost[]): void {
  peers = next
}

export function readPageHostPeers(): readonly BridgeInitHost[] {
  return peers
}
