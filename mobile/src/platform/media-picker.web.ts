import { useMemo } from 'react'
import type { BridgeMediaItem } from '../mobile-web-shell/bridge/bridge-media-verbs'
import {
  readStagedMediaItem,
  releaseAllStagedMedia,
  releaseStagedMedia
} from '../mobile-web-shell/bridge/staged-media-bytes'
import {
  NativeVerbError,
  useNativeVerbs,
  type NativeVerbs
} from '../mobile-web-shell/bridge/use-native-verbs'
import {
  MobileFileTooLargeError,
  type MediaPicker,
  type MobileImageSource,
  type PickedMobileFile,
  type PickedMobileImage
} from './media-picker-contract'
import { isPickedImageMime, mobilePickedFileFallbackName } from './mobile-picked-file-name'
import { inTapMediaPicker } from './in-tap-media-picker'

// Read staged handles in chunks because images exceed reply caps; release every handle, including unused extras, before the eight-item registry fills.
// Refusals reject; only user cancellation returns an empty selection.

// The page cannot load a native cache URI; the composer falls back to an inline data URI.
function pickedImage(base64: string, fileName: string | undefined): PickedMobileImage {
  return { base64, fileName }
}

// Older shells lack nameMedia; derive a filename from MIME instead.
async function pickedFileName(
  verbs: NativeVerbs,
  item: BridgeMediaItem,
  index: number
): Promise<string> {
  return (
    (verbs.canNameMedia ? await verbs.nameMedia(item.handle) : null) ??
    mobilePickedFileFallbackName(item.mime, index)
  )
}

async function* readPicked(
  verbs: NativeVerbs,
  items: readonly BridgeMediaItem[],
  source: MobileImageSource
): AsyncGenerator<PickedMobileImage> {
  const unread = [...items]
  try {
    let index = 0
    while (unread.length > 0) {
      const item = unread[0]!
      index += 1
      const fileName =
        source === 'files' && !isPickedImageMime(item.mime)
          ? await pickedFileName(verbs, item, index)
          : undefined
      const base64 = await readStagedMediaItem(verbs, item)
      // Release before yielding because callers may stop after one image and strand scarce handles.
      unread.shift()
      await releaseStagedMedia(verbs, item.handle)
      yield pickedImage(base64, fileName)
    }
  } finally {
    await releaseAllStagedMedia(verbs, unread)
  }
}

// With an in-tap picker, start the pick when the caller asks, still inside its tap, rather than
// when it first reads; the shell's own picker needs no activation and keeps the lazy start.
function startPick(
  verbs: NativeVerbs,
  source: MobileImageSource,
  multiple: boolean
): () => Promise<readonly BridgeMediaItem[]> {
  const inTap = verbs.canPickMedia ? inTapMediaPicker() : null
  if (inTap === null) {
    return () => verbs.pickMedia(source, multiple)
  }
  const items = inTap({ source, multiple }).then((result) => result.items)
  // A caller that stops before reading still settles this; its failure has no reader to reach.
  items.catch(() => {})
  return () => items
}

async function pickFileItems(
  pick: () => Promise<readonly BridgeMediaItem[]>
): Promise<readonly BridgeMediaItem[]> {
  try {
    return await pick()
  } catch (error) {
    throw error instanceof NativeVerbError && error.reason === 'native_media_too_large'
      ? new MobileFileTooLargeError(null)
      : error
  }
}

async function* readPickedFiles(
  verbs: NativeVerbs,
  items: readonly BridgeMediaItem[]
): AsyncGenerator<PickedMobileFile> {
  const unread = [...items]
  try {
    let index = 0
    while (unread.length > 0) {
      const item = unread[0]!
      index += 1
      const name = await pickedFileName(verbs, item, index)
      const base64 = await readStagedMediaItem(verbs, item)
      unread.shift()
      await releaseStagedMedia(verbs, item.handle)
      yield { name, mime: item.mime, byteLength: item.byteLength, base64 }
    }
  } finally {
    await releaseAllStagedMedia(verbs, unread)
  }
}

export function useMediaPicker(): MediaPicker {
  const verbs = useNativeVerbs()

  return useMemo<MediaPicker>(
    () => ({
      pickImage: async (source) => {
        for await (const image of readPicked(verbs, await startPick(verbs, source, false)(), source)) {
          return image
        }
        return null
      },
      pickImages: (source) => {
        const items = startPick(verbs, source, true)
        return {
          [Symbol.asyncIterator]: async function* () {
            yield* readPicked(verbs, await items(), source)
          }
        }
      },
      pickFiles: () => {
        const items = startPick(verbs, 'files', true)
        return {
          [Symbol.asyncIterator]: async function* () {
            yield* readPickedFiles(verbs, await pickFileItems(items))
          }
        }
      }
    }),
    [verbs]
  )
}
