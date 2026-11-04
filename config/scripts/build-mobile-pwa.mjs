#!/usr/bin/env node
// Builds the phone's page bundle with a browser host, for iOS Home Screen use without a signed app.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

process.env.ORCA_MOBILE_WEB_ENTRY = 'pwa-entry.ts'
process.env.ORCA_MOBILE_WEB_ASYNC_STORAGE = 'src/pwa/pwa-async-storage.ts'
const { buildMobileWebAppBundle } = await import('./build-mobile-web-app-bundle.mjs')

const root = resolve(import.meta.dirname, '../..')
const outDir = join(root, 'out', 'mobile-pwa')
await buildMobileWebAppBundle({ outDir })

const indexPath = join(outDir, 'index.html')
const html = readFileSync(indexPath, 'utf8')
  .replace('initial-scale=1"', 'initial-scale=1, maximum-scale=1, viewport-fit=cover"')
  .replace(
    '<title>',
    '<meta name="mobile-web-app-capable" content="yes" />\n' +
      '<meta name="apple-mobile-web-app-capable" content="yes" />\n' +
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n' +
      '<meta name="apple-mobile-web-app-title" content="Orca" />\n' +
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />\n' +
      '<link rel="manifest" href="/app.webmanifest" />\n' +
      '<style>html{background:#111}html,body{position:fixed;inset:0;overflow:hidden}</style>\n<title>'
  )
writeFileSync(indexPath, html)
copyFileSync(join(root, 'mobile/assets/icon.png'), join(outDir, 'apple-touch-icon.png'))
writeFileSync(
  join(outDir, 'app.webmanifest'),
  JSON.stringify({
    name: 'Orca',
    short_name: 'Orca',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#111111',
    icons: [{ src: '/apple-touch-icon.png', sizes: '1024x1024', type: 'image/png' }]
  })
)
console.log(`[build-mobile-pwa] OK -> ${outDir}`)
