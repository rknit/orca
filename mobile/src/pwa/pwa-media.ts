import {
  BRIDGE_MEDIA_MAX_LIVE_HANDLES,
  mediaNameParamsSchema,
  mediaPickParamsSchema,
  mediaReadParamsSchema,
  mediaReleaseParamsSchema,
  type BridgeMediaItem
} from '../mobile-web-shell/bridge/bridge-media-verbs'

const FALLBACK_MIME = 'application/octet-stream'
const staged = new Map<string, File>()

const BUTTON_STYLE =
  'font:600 17px -apple-system,system-ui,sans-serif;padding:14px;border-radius:12px;border:0;width:100%'

// The request arrives after the bridge round trip, outside the tap's handler, where Safari ignores
// input.click(). A tap on this sheet opens the picker from inside its own handler.
function confirmPick(label: string, open: () => void, cancel: () => void): void {
  const backdrop = document.createElement('div')
  backdrop.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.4);display:flex;flex-direction:column;justify-content:flex-end;gap:8px;padding:12px 12px calc(env(safe-area-inset-bottom) + 12px);box-sizing:border-box'
  const choose = document.createElement('button')
  choose.textContent = label
  choose.style.cssText = `${BUTTON_STYLE};background:#eee;color:#111`
  const dismiss = document.createElement('button')
  dismiss.textContent = 'Cancel'
  dismiss.style.cssText = `${BUTTON_STYLE};background:#2a2a2a;color:#eee`
  choose.onclick = (event) => {
    event.stopPropagation()
    backdrop.remove()
    open()
  }
  backdrop.onclick = () => {
    backdrop.remove()
    cancel()
  }
  backdrop.append(choose, dismiss)
  document.body.append(backdrop)
}

// A null label clicks at once, for callers still inside the tap's handler.
function pickFiles(accept: string, multiple: boolean, label: string | null): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.display = 'none'
    const finish = (files: File[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish([...(input.files ?? [])]))
    input.addEventListener('cancel', () => finish([]))
    document.body.append(input)
    if (label === null) {
      input.click()
    } else {
      confirmPick(label, () => input.click(), () => finish([]))
    }
  })
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function stage(files: readonly File[]): { items: BridgeMediaItem[] } {
  const room = BRIDGE_MEDIA_MAX_LIVE_HANDLES - staged.size
  return {
    items: files.slice(0, room).map((file) => {
      const handle = crypto.randomUUID()
      staged.set(handle, file)
      return { handle, mime: file.type || FALLBACK_MIME, byteLength: file.size }
    })
  }
}

function pickLabel(source: 'library' | 'files', multiple: boolean): string {
  if (source === 'library') {
    return multiple ? 'Choose photos' : 'Choose a photo'
  }
  return multiple ? 'Choose files' : 'Choose a file'
}

async function pick(params: unknown, label: (source: 'library' | 'files', multiple: boolean) => string | null) {
  const { source, multiple } = mediaPickParamsSchema.parse(params)
  // A page can't read clipboard images without a prompt per paste, so paste stays text-only.
  if (source === 'clipboard') {
    return { items: [] }
  }
  return stage(await pickFiles(source === 'library' ? 'image/*' : '', multiple, label(source, multiple)))
}

// Served through the bridge, the request arrives after the tap, so the picker needs its own sheet.
export function pickMedia(params: unknown): Promise<{ items: BridgeMediaItem[] }> {
  return pick(params, pickLabel)
}

// Called synchronously from the tap's handler, so Safari opens the picker with no extra sheet.
// The handles it returns are read and released through the bridge like any other.
export function pickMediaInTap(params: unknown): Promise<{ items: BridgeMediaItem[] }> {
  return pick(params, () => null)
}

export async function readMedia(params: unknown): Promise<{ base64: string; eof: boolean }> {
  const { handle, offset, length } = mediaReadParamsSchema.parse(params)
  const file = staged.get(handle)
  if (!file) {
    throw new Error('This file is no longer available')
  }
  const end = offset + length
  const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer())
  return { base64: bytesToBase64(chunk), eof: end >= file.size }
}

export function releaseMedia(params: unknown): { released: boolean } {
  return { released: staged.delete(mediaReleaseParamsSchema.parse(params).handle) }
}

export function nameMedia(params: unknown): { name: string | null } {
  return {
    name: staged.get(mediaNameParamsSchema.parse(params).handle)?.name.slice(0, 255) || null
  }
}
