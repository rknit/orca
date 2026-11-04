// Home Screen entry: installs a browser host for the phone's page bundle, which then boots unchanged.
import { startPwaHost } from '../src/pwa/pwa-host'
import {
  adoptPairingFromFragment,
  readActivePairing,
  showPairingForm
} from '../src/pwa/pwa-pairing'

const root = document.getElementById('root') ?? document.body
adoptPairingFromFragment()
// Pasting a link on this same site only changes the fragment, which doesn't reload the page.
window.addEventListener('hashchange', () => {
  if (adoptPairingFromFragment()) {
    location.replace('/')
  }
})
if (readActivePairing() === null) {
  showPairingForm(root)
} else {
  startPwaHost(root)
  void import('./index')
}
