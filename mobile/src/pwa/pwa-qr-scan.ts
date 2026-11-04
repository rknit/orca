/** Resolves with the first QR the camera sees that passes `accept`; stop() ends the scan unresolved. */
export async function startQrScan(
  container: HTMLElement,
  accept: (text: string) => boolean,
  onFound: (text: string) => void
): Promise<() => void> {
  // Loaded on demand so a page that never scans doesn't pay for the decoder.
  const { default: decodeQr } = await import('jsqr')
  const stream = await navigator.mediaDevices.getUserMedia({
    // Pairing codes are dense and the default 640x480 can't resolve one shown small on a screen.
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
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    for (const track of stream.getTracks()) {
      track.stop()
    }
    video.remove()
  }
  let frameCount = 0
  const decodeRegion = (scale: number): string | undefined => {
    if (!context) {
      return undefined
    }
    const { videoWidth: width, videoHeight: height } = video
    const size = Math.min(width, height) * scale
    canvas.width = size
    canvas.height = size
    context.drawImage(video, (width - size) / 2, (height - size) / 2, size, size, 0, 0, size, size)
    return decodeQr(context.getImageData(0, 0, size, size).data, size, size)?.data
  }
  const scan = () => {
    // Decoding a full frame is slow on a phone; alternate with the center, where people aim.
    frameCount += 1
    if (video.videoWidth > 0 && frameCount % 6 === 0) {
      const text = decodeRegion(frameCount % 12 === 0 ? 1 : 0.5)
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
