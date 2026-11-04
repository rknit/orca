import { parsePairingCode } from '../transport/pairing'
import { migrateLegacyHostNames } from './pwa-host-name'
import type { PairingOffer } from '../../../src/shared/remote-runtime/pairing/mobile-relay-pairing-offer'

const LEGACY_PAIRING_KEY = 'orca-pwa:pairing'
const PAIRINGS_KEY = 'orca-pwa:pairings'
const ACTIVE_KEY = 'orca-pwa:active-server'
const FIRST_SERVER_ID = 'server'

export type StoredPairing = { id: string; code: string }

function writePairings(pairings: readonly StoredPairing[]): void {
  localStorage.setItem(PAIRINGS_KEY, JSON.stringify(pairings))
}

export function readPairings(): StoredPairing[] {
  const legacy = localStorage.getItem(LEGACY_PAIRING_KEY)
  if (legacy !== null) {
    writePairings([{ id: FIRST_SERVER_ID, code: legacy }])
    localStorage.removeItem(LEGACY_PAIRING_KEY)
    migrateLegacyHostNames(FIRST_SERVER_ID)
  }
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PAIRINGS_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is StoredPairing => parsePairingCode(entry?.code ?? '') !== null
        )
      : []
  } catch {
    return []
  }
}

export function setActivePairing(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

export function readActivePairing(): (StoredPairing & { offer: PairingOffer }) | null {
  const pairings = readPairings()
  const active =
    pairings.find((pairing) => pairing.id === localStorage.getItem(ACTIVE_KEY)) ?? pairings[0]
  const offer = active ? parsePairingCode(active.code) : null
  return active && offer ? { ...active, offer } : null
}

/** A new link for a server already held replaces its old link rather than listing it twice. */
function savePairing(code: string): void {
  const publicKey = parsePairingCode(code)?.publicKeyB64
  const pairings = readPairings()
  const existing = pairings.find(
    (pairing) => parsePairingCode(pairing.code)?.publicKeyB64 === publicKey
  )
  const taken = new Set(pairings.map((pairing) => pairing.id))
  let id = existing?.id ?? FIRST_SERVER_ID
  for (let number = 2; !existing && taken.has(id); number += 1) {
    id = `server-${number}`
  }
  writePairings([...pairings.filter((pairing) => pairing.id !== id), { id, code }])
  setActivePairing(id)
}

/** A link opened in Safari carries its code in the fragment; Home Screen apps don't share Safari's storage, so they paste. */
export function adoptPairingFromFragment(): boolean {
  const code = new URLSearchParams(location.hash.slice(1)).get('pairing')
  if (!code || !parsePairingCode(code)) {
    return false
  }
  savePairing(code)
  history.replaceState(null, '', location.pathname)
  return true
}

export function showPairingForm(root: HTMLElement, message?: string): void {
  root.innerHTML = ''
  root.style.cssText =
    'display:flex;flex-direction:column;gap:12px;padding:calc(env(safe-area-inset-top) + 24px) 20px 20px;font:16px -apple-system,system-ui,sans-serif;color:#eee;width:100%;box-sizing:border-box'
  const title = document.createElement('h1')
  title.textContent = 'Pair with Orca'
  title.style.cssText = 'font-size:22px;margin:0'
  const note = document.createElement('p')
  note.textContent = message ?? 'Paste the pairing link from the server.'
  note.style.cssText = 'margin:0;color:#aaa'
  const input = document.createElement('textarea')
  input.placeholder = 'orca://pair?code=…'
  input.rows = 5
  input.style.cssText =
    'font:16px ui-monospace,monospace;padding:10px;border-radius:8px;border:1px solid #444;background:#1a1a1a;color:#eee;width:100%;box-sizing:border-box'
  const button = document.createElement('button')
  button.textContent = 'Pair'
  button.style.cssText =
    'font:600 16px -apple-system,system-ui,sans-serif;padding:12px;border-radius:8px;border:0;background:#eee;color:#111'
  button.onclick = () => {
    if (!parsePairingCode(input.value)) {
      note.textContent = 'That is not a valid pairing link.'
      return
    }
    savePairing(input.value.trim())
    location.replace('/')
  }
  root.append(title, note, input, button)
}

/** A page failure says nothing about the pairing, so it must not read as a request to pair again. */
export function showPageFault(root: HTMLElement, message: string): void {
  root.innerHTML = ''
  root.style.cssText =
    'display:flex;flex-direction:column;gap:12px;padding:calc(env(safe-area-inset-top) + 24px) 20px 20px;font:16px -apple-system,system-ui,sans-serif;color:#eee;width:100%;box-sizing:border-box'
  const title = document.createElement('h1')
  title.textContent = 'Something went wrong'
  title.style.cssText = 'font-size:22px;margin:0'
  const note = document.createElement('p')
  note.textContent = message
  note.style.cssText = 'margin:0;color:#aaa;overflow-wrap:anywhere'
  const button = document.createElement('button')
  button.textContent = 'Back to Home'
  button.style.cssText =
    'font:600 16px -apple-system,system-ui,sans-serif;padding:12px;border-radius:8px;border:0;background:#eee;color:#111'
  button.onclick = () => location.replace('/')
  root.append(title, note, button)
}
