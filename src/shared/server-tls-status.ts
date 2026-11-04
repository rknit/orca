export type ServerTlsStatus = {
  sourceUrl: string
  port: number
  serving: boolean
  /** The latest refresh problem; a serving listener keeps its last good certificate. */
  error: string | null
  hostname?: string | null
  expiresAt?: number
}
