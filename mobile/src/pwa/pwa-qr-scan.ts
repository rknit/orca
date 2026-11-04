const WASM_PATH = '/zxing_reader.wasm'
const SCAN_INTERVAL_MS = 120
const MAX_PHOTO_EDGE = 2400

type QrDecoder = (image: ImageData) => Promise<string[]>

// ZXing rather than a pure-JS decoder: phone shots of these dense codes are low contrast and off-angle.
async function loadDecoder(): Promise<QrDecoder> {
  const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader')
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? WASM_PATH : prefix + path
    }
  })
  return async (image) => {
    const results = await readBarcodes(image, {
      formats: ['QRCode'],
      tryHarder: true,
      maxNumberOfSymbols: 1
    })
    return results.filter((result) => result.isValid).map((result) => result.text)
  }
}

/** Calls onFound with the first code `accept` allows; the returned function ends the scan. */
export async function startQrScan(
  container: HTMLElement,
  accept: (text: string) => boolean,
  onFound: (text: string) => void,
  onStatus: (status: string) => void
): Promise<() => void> {
  const decode = await loadDecoder()
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false
  })
  const video = document.createElement('video')
  video.setAttribute('playsinline', 'true')
  video.muted = true
  video.srcObject = stream
  video.style.cssText = 'width:100%;border-radius:8px;background:#000'
  container.append(video)
  await video.play()

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    stopped = true
    clearTimeout(timer)
    for (const track of stream.getTracks()) {
      track.stop()
    }
    video.remove()
  }
  let scans = 0
  const scan = async () => {
    const { videoWidth: width, videoHeight: height } = video
    if (context && width > 0) {
      scans += 1
      // Alternate with the center, where people aim and a small code fills more pixels.
      const size =
        scans % 2 === 0 ? Math.min(width, height) : Math.floor(Math.min(width, height) / 2)
      canvas.width = size
      canvas.height = size
      context.drawImage(
        video,
        (width - size) / 2,
        (height - size) / 2,
        size,
        size,
        0,
        0,
        size,
        size
      )
      const found = (await decode(context.getImageData(0, 0, size, size))).find(accept)
      if (found && !stopped) {
        stop()
        onFound(found)
        return
      }
      onStatus(
        `Scanning… ${width}×${height}, ${scans} tries. Hold steady, about a hand's length away.`
      )
    }
    if (!stopped) {
      timer = setTimeout(() => void scan().catch(() => {}), SCAN_INTERVAL_MS)
    }
  }
  void scan()
  return stop
}

/** A still photo has far more detail than a video frame, for when live scanning can't lock on. */
export async function readQrFromPhoto(file: File): Promise<string | null> {
  const decode = await loadDecoder()
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return null
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return (await decode(context.getImageData(0, 0, canvas.width, canvas.height)))[0] ?? null
}
