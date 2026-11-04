/** Resolves with the first QR the camera sees that passes `accept`; stop() ends the scan unresolved. */
export async function startQrScan(
  container: HTMLElement,
  accept: (text: string) => boolean,
  onFound: (text: string) => void
): Promise<() => void> {
  // Loaded on demand so a page that never scans doesn't pay for the decoder.
  const { default: decodeQr } = await import('jsqr')
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
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
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    for (const track of stream.getTracks()) {
      track.stop()
    }
    video.remove()
  }
  const scan = () => {
    if (context && video.videoWidth > 0) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0)
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      const text = decodeQr(image.data, image.width, image.height)?.data
      if (text && accept(text)) {
        stop()
        onFound(text)
        return
      }
    }
    frame = requestAnimationFrame(scan)
  }
  frame = requestAnimationFrame(scan)
  return stop
}
