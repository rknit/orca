// Optional wss:// listener beside the plain one, for clients that refuse ws:// (browsers on https pages).
// Configured by <userData>/server-tls.json; certificates come from local files or a URL, so nothing here renews them.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import type { RequestListener } from 'node:http'
import { join } from 'node:path'
import { createSecureContext } from 'node:tls'
import { z } from 'zod'

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 30_000

const ServerTlsConfigSchema = z.strictObject({
  port: z.number().int().min(1).max(65_535),
  certFile: z.string().min(1).optional(),
  keyFile: z.string().min(1).optional(),
  certUrl: z.url().optional(),
  keyUrl: z.url().optional(),
  authorization: z.string().min(1).optional()
})

export type ServerTlsConfig = z.infer<typeof ServerTlsConfigSchema>

type CertificatePair = { cert: string; key: string }

export function readServerTlsConfig(userDataPath: string): ServerTlsConfig | null {
  const path = join(userDataPath, 'server-tls.json')
  if (!existsSync(path)) {
    return null
  }
  try {
    return ServerTlsConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    console.warn('[ws-tls] ignoring invalid server-tls.json:', String(error))
    return null
  }
}

async function fetchPem(url: string, authorization: string | undefined): Promise<string> {
  const response = await fetch(url, {
    headers: authorization ? { Authorization: authorization } : {},
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`)
  }
  return response.text()
}

function isUsable(pair: CertificatePair): boolean {
  try {
    createSecureContext(pair)
    return true
  } catch {
    return false
  }
}

function readCertificateFiles(certFile: string, keyFile: string): CertificatePair | null {
  try {
    const pair = { cert: readFileSync(certFile, 'utf8'), key: readFileSync(keyFile, 'utf8') }
    return isUsable(pair) ? pair : null
  } catch {
    return null
  }
}

export class WsTlsListener {
  private server: HttpsServer | null = null
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private installed: CertificatePair | null = null
  private stopped = false

  constructor(
    private readonly options: {
      config: ServerTlsConfig
      host: string
      userDataPath: string
      requestListener: RequestListener
      onServerListening: (server: HttpsServer) => void
    }
  ) {}

  private get cacheDir(): string {
    return join(this.options.userDataPath, 'server-tls-cache')
  }

  /** Never rejects: a certificate problem must not stop the plain listener from serving. */
  async start(): Promise<void> {
    await this.refresh()
    this.refreshTimer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS)
    this.refreshTimer.unref?.()
  }

  stop(): HttpsServer | null {
    this.stopped = true
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
    const server = this.server
    this.server = null
    return server
  }

  private async refresh(): Promise<void> {
    try {
      const pair = await this.loadCertificates()
      if (pair) {
        await this.install(pair)
      }
    } catch (error) {
      console.warn('[ws-tls] certificate refresh failed:', String(error))
    }
  }

  private async loadCertificates(): Promise<CertificatePair | null> {
    const { certFile, keyFile, certUrl, keyUrl, authorization } = this.options.config
    if (certFile && keyFile) {
      return readCertificateFiles(certFile, keyFile)
    }
    if (!certUrl || !keyUrl) {
      return null
    }
    const cachedCert = join(this.cacheDir, 'cert.pem')
    const cachedKey = join(this.cacheDir, 'key.pem')
    try {
      const pair = {
        cert: await fetchPem(certUrl, authorization),
        key: await fetchPem(keyUrl, authorization)
      }
      if (!isUsable(pair)) {
        throw new Error('the fetched certificate and key are not a usable pair')
      }
      mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 })
      writeFileSync(cachedCert, pair.cert, { mode: 0o600 })
      writeFileSync(cachedKey, pair.key, { mode: 0o600 })
      chmodSync(cachedKey, 0o600)
      return pair
    } catch (error) {
      // Off the certificate source's network: the last good copy stays valid for weeks.
      console.warn('[ws-tls] using cached certificate:', String(error))
      return readCertificateFiles(cachedCert, cachedKey)
    }
  }

  private async install(pair: CertificatePair): Promise<void> {
    if (this.stopped || (this.installed?.cert === pair.cert && this.installed.key === pair.key)) {
      return
    }
    if (this.server) {
      this.server.setSecureContext(pair)
    } else {
      const server = createHttpsServer(pair, this.options.requestListener)
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(this.options.config.port, this.options.host, () => {
          server.off('error', reject)
          resolve()
        })
      })
      if (this.stopped) {
        server.close()
        return
      }
      this.server = server
      this.options.onServerListening(server)
    }
    this.installed = pair
  }
}
