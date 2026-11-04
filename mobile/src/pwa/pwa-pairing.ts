import { parsePairingCode } from '../transport/pairing'
import type { PairingOffer } from '../../../src/shared/remote-runtime/pairing/mobile-relay-pairing-offer'

const PAIRING_KEY = 'orca-pwa:pairing'

export function readStoredPairing(): PairingOffer | null {
  try {
    const stored = localStorage.getItem(PAIRING_KEY)
    return stored ? parsePairingCode(stored) : null
  } catch {
    return null
  }
}

/** A link opened in Safari carries its code in the fragment; Home Screen apps don't share Safari's storage, so they paste. */
export function adoptPairingFromFragment(): void {
  const code = new URLSearchParams(location.hash.slice(1)).get('pairing')
  if (code && parsePairingCode(code)) {
    localStorage.setItem(PAIRING_KEY, code)
    history.replaceState(null, '', location.pathname)
  }
}

export function forgetPairing(): void {
  localStorage.removeItem(PAIRING_KEY)
}

export function showPairingForm(root: HTMLElement, message?: string): void {
  root.innerHTML = ''
  root.style.cssText =
    'display:flex;flex-direction:column;gap:12px;padding:calc(env(safe-area-inset-top) + 24px) 20px 20px;font:16px -apple-system,system-ui,sans-serif;color:#eee;width:100%'
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
    localStorage.setItem(PAIRING_KEY, input.value.trim())
    location.replace('/')
  }
  root.append(title, note, input, button)
}
