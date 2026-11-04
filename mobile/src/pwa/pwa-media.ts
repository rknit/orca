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

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
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
    // Safari only opens a picker inside the tap's activation, so nothing may await before this.
    input.click()
  })
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export async function pickMedia(params: unknown): Promise<{ items: BridgeMediaItem[] }> {
  const { source, multiple } = mediaPickParamsSchema.parse(params)
  // A page can't read clipboard images without a prompt per paste, so paste stays text-only.
  if (source === 'clipboard') {
    return { items: [] }
  }
  const files = await pickFiles(source === 'library' ? 'image/*' : '', multiple)
  const room = BRIDGE_MEDIA_MAX_LIVE_HANDLES - staged.size
  return {
    items: files.slice(0, room).map((file) => {
      const handle = crypto.randomUUID()
      staged.set(handle, file)
      return { handle, mime: file.type || FALLBACK_MIME, byteLength: file.size }
    })
  }
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
