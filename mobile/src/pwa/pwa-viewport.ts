import type { BridgeHost } from '../mobile-web-shell/bridge-host-contract'

function readSafeAreaInsets(probe: HTMLElement) {
  const style = getComputedStyle(probe)
  return {
    top: Number.parseFloat(style.paddingTop) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0
  }
}

function createSafeAreaProbe(): HTMLElement {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.documentElement.append(probe)
  return probe
}

function readKeyboardInset(): number {
  const viewport = window.visualViewport
  return viewport ? Math.max(0, Math.round(innerHeight - viewport.height - viewport.offsetTop)) : 0
}

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)')

export function readColorScheme(): 'dark' | 'light' {
  return darkScheme.matches ? 'dark' : 'light'
}

export function readInitialViewport() {
  const probe = createSafeAreaProbe()
  const safeAreaInsets = readSafeAreaInsets(probe)
  probe.remove()
  return { safeAreaInsets, keyboardInset: readKeyboardInset() }
}

/** The page reads insets only from its shell, and WebKit pans the document under an open keyboard. */
export function trackViewport(host: BridgeHost): void {
  const probe = createSafeAreaProbe()
  const publish = () => {
    // Undo WebKit's pan: the keyboard inset already lifts the page.
    window.scrollTo(0, 0)
    host.publishSafeAreaInsets(readSafeAreaInsets(probe))
    host.publishKeyboardInset(readKeyboardInset())
  }
  window.visualViewport?.addEventListener('resize', publish)
  window.visualViewport?.addEventListener('scroll', publish)
  window.addEventListener('orientationchange', publish)
  darkScheme.addEventListener('change', () => host.publishColorScheme(readColorScheme()))
}
