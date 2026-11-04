import { MOBILE_WEB_PAGE_ROUTES } from './mobile-web-page-routes.mjs'

const APP_SCREEN_GRANTS = ['navigate', 'storage', 'externalLink', 'haptics', 'native.clipboard.write']

// The native app draws these itself; the web app has no native side, so its page owns them too.
export const MOBILE_PWA_PAGE_ROUTES = [
  ...MOBILE_WEB_PAGE_ROUTES,
  ...[
    '/',
    '/settings',
    '/appearance-settings',
    '/browser-settings',
    '/terminal-settings',
    '/voice-settings',
    '/native-chat-settings',
    '/connection-log',
    '/troubleshoot',
    '/about',
    '/new-workspace'
  ].map((pathname) => ({ pathname, grants: APP_SCREEN_GRANTS }))
]
