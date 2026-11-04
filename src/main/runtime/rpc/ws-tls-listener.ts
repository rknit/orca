// Optional wss:// listener beside the plain one, for clients that refuse ws:// (browsers on https pages).
// Certificates come from a source URL serving fullchain.pem and key.pem, so whatever renews them lives elsewhere.
import { X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import type { RequestListener } from 'node:http'
import { join } from 'node:path'
import { createSecureContext } from 'node:tls'
import { z } from 'zod'
import type { ServerTlsStatus } from '../../../shared/server-tls-status'

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 30_000
export const DEFAULT_SERVER_TLS_PORT = 6769

const ServerTlsConfigSchema = z.strictObject({
  sourceUrl: z.url(),
  port: z.number().int().min(1).max(65_535).default(DEFAULT_SERVER_TLS_PORT)
})

export type ServerTlsConfig = z.infer<typeof ServerTlsConfigSchema>

type CertificatePair = { cert: string; key: string }

function configPath(userDataPath: string): string {
  return join(userDataPath, 'server-tls.json')
}

export function readServerTlsConfig(userDataPath: string): ServerTlsConfig | null {
  const path = configPath(userDataPath)
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

export function writeServerTlsSource(userDataPath: string, sourceUrl: string | null): void {
  if (sourceUrl === null) {
    rmSync(configPath(userDataPath), { force: true })
    return
  }
  const config = ServerTlsConfigSchema.parse({ sourceUrl })
  writeFileSync(configPath(userDataPath), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
}

async function fetchPem(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
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

function describeCertificate(cert: string): { hostname: string | null; expiresAt: number } {
  const parsed = new X509Certificate(cert)
  const hostname = parsed.subjectAltName?.match(/DNS:([^,\s]+)/)?.[1] ?? null
  return { hostname, expiresAt: Date.parse(parsed.validTo) }
}

export class WsTlsListener {
  private server: HttpsServer | null = null
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private installed: CertificatePair | null = null
  private stopped = false
  private lastError: string | null = null

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

  get status(): ServerTlsStatus {
    const { config } = this.options
    return {
      sourceUrl: config.sourceUrl,
      port: config.port,
      serving: this.server !== null,
      error: this.lastError,
      ...(this.installed ? describeCertificate(this.installed.cert) : {})
    }
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
      await this.install(await this.loadCertificates())
      this.lastError = null
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      console.warn('[ws-tls] certificate refresh failed:', this.lastError)
    }
  }

  private async loadCertificates(): Promise<CertificatePair> {
    const source = this.options.config.sourceUrl.replace(/\/$/, '')
    const cachedCert = join(this.cacheDir, 'cert.pem')
    const cachedKey = join(this.cacheDir, 'key.pem')
    try {
      const pair = {
        cert: await fetchPem(`${source}/fullchain.pem`),
        key: await fetchPem(`${source}/key.pem`)
      }
      if (!isUsable(pair)) {
        throw new Error('the source returned an unusable certificate and key')
      }
      mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 })
      writeFileSync(cachedCert, pair.cert, { mode: 0o600 })
      writeFileSync(cachedKey, pair.key, { mode: 0o600 })
      return pair
    } catch (error) {
      // Away from the source's network, the last good copy stays valid for weeks.
      if (existsSync(cachedCert) && existsSync(cachedKey)) {
        const cached = {
          cert: readFileSync(cachedCert, 'utf8'),
          key: readFileSync(cachedKey, 'utf8')
        }
        if (isUsable(cached)) {
          this.lastError = error instanceof Error ? error.message : String(error)
          return cached
        }
      }
      throw error
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

// One running transport serves wss://; settings reach it here without threading it through the runtime.
let activeTlsControl: { reload: () => Promise<void>; status: () => ServerTlsStatus | null } | null =
  null

export function setActiveServerTlsControl(control: typeof activeTlsControl): void {
  activeTlsControl = control
}

export async function reloadServerTls(): Promise<void> {
  await activeTlsControl?.reload()
}

export function readServerTlsStatus(): ServerTlsStatus | null {
  return activeTlsControl?.status() ?? null
}
