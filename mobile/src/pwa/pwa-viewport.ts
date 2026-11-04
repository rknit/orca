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

// iOS can shrink innerHeight with the keyboard open, so measure against the tallest it has been.
let fullHeight = 0

function readKeyboardInset(): number {
  const viewport = window.visualViewport
  if (!viewport) {
    return 0
  }
  fullHeight = Math.max(fullHeight, innerHeight, viewport.height)
  return Math.max(0, Math.round(fullHeight - viewport.height))
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
  const root = document.getElementById('root')
  const publish = () => {
    // The inset lifts the page; WebKit may also pan it to reveal the input, so follow that pan.
    window.scrollTo(0, 0)
    if (root && window.visualViewport) {
      root.style.transform = `translateY(${window.visualViewport.offsetTop}px)`
    }
    host.publishSafeAreaInsets(readSafeAreaInsets(probe))
    host.publishKeyboardInset(readKeyboardInset())
  }
  window.visualViewport?.addEventListener('resize', publish)
  window.visualViewport?.addEventListener('scroll', publish)
  window.addEventListener('orientationchange', () => {
    fullHeight = 0
    publish()
  })
  darkScheme.addEventListener('change', () => host.publishColorScheme(readColorScheme()))
}
