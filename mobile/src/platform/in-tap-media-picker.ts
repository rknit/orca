import type { BridgeMediaItem, BridgeMediaSource } from '../mobile-web-shell/bridge/bridge-media-verbs'

// Safari opens a file picker only inside the tap's handler, which a bridge round trip leaves. A host
// sharing the page's document (the web app) registers a picker the page calls synchronously.
export type InTapMediaPicker = (params: {
  source: BridgeMediaSource
  multiple: boolean
}) => Promise<{ items: readonly BridgeMediaItem[] }>

let registered: InTapMediaPicker | null = null

export function registerInTapMediaPicker(picker: InTapMediaPicker | null): void {
  registered = picker
}

export function inTapMediaPicker(): InTapMediaPicker | null {
  return registered
}
