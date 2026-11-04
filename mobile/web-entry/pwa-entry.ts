// Home Screen entry: installs a browser host for the phone's page bundle, which then boots unchanged.
import {
  adoptPairingFromFragment,
  readStoredPairing,
  showPairingForm
} from '../src/pwa/pwa-pairing'
import { startPwaHost } from '../src/pwa/pwa-host'

const root = document.getElementById('root') ?? document.body
adoptPairingFromFragment()
const offer = readStoredPairing()
if (offer === null) {
  showPairingForm(root)
} else {
  startPwaHost(root, offer)
  void import('./index')
}
